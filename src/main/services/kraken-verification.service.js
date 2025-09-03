import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import { addDelay } from '../../shared/helpers/calibration-helper.js';
import { generateStepArray } from '../utils/kraken-calibration.utils.js';
import { KrakenPDFService } from './kraken-pdf.service.js';

import * as Sentry from '@sentry/electron/main';

class KrakenVerificationService {
  constructor(globalState, flukeManager, sendToRenderer, showLogOnScreen) {
    this.globalState = globalState;
    // Use the passed flukeManager (which should be from the factory)
    this.fluke = flukeManager;
    this.sendToRenderer = sendToRenderer;
    this.showLogOnScreen = showLogOnScreen;
    this.isSweepRunning = false;
    this.pdfService = new KrakenPDFService();
    this.testerName = 'HoseMonster Tester'; // Default value
  }

  /**
   * Set the tester name for PDF generation
   * @param {string} testerName - Name of the tester who performed the calibration
   */
  setTesterName(testerName) {
    this.testerName = testerName;
  }

  /**
   * Stops the verification sweep process.
   */
  async stopVerification() {
    this.isSweepRunning = false;
    this.showLogOnScreen('⏹️ Verification process stopped by user.');
    console.log('Verification sweep stopped by user');

    // Set Fluke to zero pressure in background without waiting or logging
    this.fluke.setZeroPressureToFluke(true).catch(error => {
      // Silently log error to console only, no user notification
      console.error('Background Fluke zero pressure failed:', error);
      Sentry.captureException(error);
    });
  }

  /**
   * Starts the verification sweep process.
   */
  async startVerification() {
    this.showLogOnScreen('--- KRAKEN VERIFICATION PROCESS ---');
    console.log('Starting Kraken verification sweep...');
    this.isSweepRunning = true;
    this.globalState.clearKrakenSweepData();

    // Send verification started event to renderer
    this.sendToRenderer('kraken-verification-started');

    const devices = this.globalState.getConnectedDevices();
    if (devices.length === 0) {
      this.showLogOnScreen('❌ No connected devices found for verification.');
      this.isSweepRunning = false;
      return;
    }

    // Assume all devices have same pressure range, use the first one.
    const pressurePoints = generateStepArray(KRAKEN_CONSTANTS.SWEEP_VALUE);

    try {
      for (let i = 0; i < pressurePoints.length; i++) {
        const targetPressure = pressurePoints[i];
        if (!this.isSweepRunning) {
          this.showLogOnScreen('⏹️ Verification sweep was cancelled.');
          break;
        }

        await this.setFlukeAndCaptureReadings(targetPressure);
      }

      if (this.isSweepRunning) {
        this.showLogOnScreen('✅ Verification sweep completed successfully.');

        // Process certification results and generate PDFs
        await this.processVerificationResults();

        this.sendToRenderer('kraken-verification-sweep-completed', this.globalState.getKrakenSweepData());
      }
    } catch (error) {
      Sentry.captureException(error);
      this.showLogOnScreen(`❌ Error during verification sweep: ${error.message}`);
      console.error('Error during verification sweep:', error);
    } finally {
      // Always set Fluke to zero pressure after verification completes or fails (silently)
      this.fluke.setZeroPressureToFluke(true).catch(error => {
        // Silently log error to console only, no user notification
        console.error('Background Fluke zero pressure failed after completion:', error);
        Sentry.captureException(error);
      });
      this.isSweepRunning = false;
    }
  }

  /**
   * Sets the Fluke to a target pressure, waits, and captures Kraken readings.
   * @param {number} targetPressure - The pressure to set on the Fluke.
   */
  async setFlukeAndCaptureReadings(targetPressure) {
    try {
      this.showLogOnScreen(`⚙️ Setting Fluke to ${targetPressure.toFixed(2)} PSI...`);

      // if (targetPressure === 0) {
      //   await this.fluke.setZeroPressureToFluke();
      //   await this.fluke.waitForFlukeToReachZeroPressure();
      // } else {
      await this.fluke.setHighPressureToFluke(targetPressure);
      await this.fluke.waitForFlukeToReachTargetPressure(targetPressure);
      // }

      this.showLogOnScreen(`✅ Fluke reached ${targetPressure.toFixed(2)} PSI. Stabilizing...`);
      // Send current Fluke pressure to renderer for display
      this.sendToRenderer('update-kraken-calibration-reference-pressure', targetPressure);
      await addDelay(KRAKEN_CONSTANTS.DELAY_AFTER_PRESSURE_SET);

      this.showLogOnScreen('📸 Capturing pressure readings from Krakens...');
      const devices = this.globalState.getConnectedDevices();

      for (const device of devices) {
        // Get the latest pressure reading from global state (which is continuously updated via BLE)
        const latestPressure = this.globalState.getDevicePressure(device.id);
        if (latestPressure !== null) {
          this.globalState.addKrakenSweepData(device.id, {
            flukePressure: targetPressure,
            krakenPressure: latestPressure,
            timestamp: Date.now(),
            readings: [latestPressure], // Store single reading for consistency
          });

          this.showLogOnScreen(`  - ✅ ${device.name || device.id}: ${latestPressure.toFixed(2)} PSI`);

          // Send real-time update to renderer for this pressure point
          this.updateKrakenVerificationTable(device.id, targetPressure, latestPressure, [latestPressure]);

          // Send Kraken pressure update to renderer
          this.sendToRenderer('update-kraken-pressure', {
            deviceId: device.id,
            deviceName: device.name || device.id,
            pressure: latestPressure,
          });
        } else {
          this.showLogOnScreen(`  - ❌ ${device.name || device.id}: No reading available.`);
        }
      }
    } catch (error) {
      Sentry.captureException(error);
      const errorMessage = `Error during verification at ${targetPressure} PSI: ${error.message}`;
      this.showLogOnScreen(`❌ ${errorMessage}`);
      console.error(`Error at pressure ${targetPressure}:`, error);

      // Stop the sweep on a critical Fluke error
      this.isSweepRunning = false;

      // Re-throw the error to be handled by the calling method
      throw new Error(errorMessage);
    }
  }

  /**
   * Update Kraken verification table in real-time
   * @param {string} deviceId - Device ID
   * @param {number} flukePressure - Fluke pressure setting
   * @param {number} krakenPressure - Average Kraken pressure reading
   * @param {Array} readings - All individual readings
   */
  updateKrakenVerificationTable(deviceId, flukePressure, krakenPressure, readings) {
    // Get current sweep data to include all previous points
    const currentSweepData = this.globalState.getKrakenSweepData();

    console.log('Updating verification table with data:', {
      deviceId,
      flukePressure,
      krakenPressure,
      readings,
      currentSweepData,
    });

    this.sendToRenderer('kraken-verification-realtime-update', {
      deviceId,
      flukePressure,
      krakenPressure,
      readings,
      timestamp: Date.now(),
      currentSweepData, // Include all data so far for real-time table update
    });
  }

  /**
   * Process verification results and determine certification status
   */
  async processVerificationResults() {
    try {
      const sweepData = this.globalState.getKrakenSweepData();
      const devices = this.globalState.getConnectedDevices();

      if (!devices || devices.length === 0) {
        this.showLogOnScreen('⚠️ No devices found for certification processing.');
        return;
      }

      let processedCount = 0;
      let errorCount = 0;
      let pdfGeneratedCount = 0;

      // Process each device's certification
      for (const device of devices) {
        try {
          const deviceData = sweepData[device.id];
          if (deviceData && Array.isArray(deviceData) && deviceData.length > 0) {
            const certificationResult = this.calculateDeviceCertification(device.id, deviceData);

            // Update device certification status in global state
            this.globalState.setDeviceCertificationStatus(device.id, certificationResult);

            // Send certification status update to renderer
            this.sendToRenderer('certification-status-update', {
              deviceId: device.id,
              certificationResult: certificationResult,
            });

            // Generate PDF report for this device
            const pdfResult = await this.generateDevicePDF(device, deviceData, certificationResult);
            if (pdfResult && pdfResult.success) {
              pdfGeneratedCount++;
            }

            processedCount++;
            this.showLogOnScreen(`✅ Processed certification for ${device.displayName || device.id}`);
          } else {
            this.showLogOnScreen(`⚠️ No verification data available for ${device.displayName || device.id}`);
          }
        } catch (deviceError) {
          errorCount++;
          Sentry.captureException(deviceError);
          console.error(`Error processing device ${device.id}:`, deviceError);
          this.showLogOnScreen(`❌ Failed to process ${device.displayName || device.id}: ${deviceError.message}`);
        }
      }

      if (errorCount === 0) {
        this.showLogOnScreen(`📋 Certification results processed successfully for ${processedCount} device(s).`);
      } else {
        this.showLogOnScreen(`📋 Certification processing completed with ${errorCount} error(s). ${processedCount} device(s) processed successfully.`);
      }
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error processing verification results:', error);
      this.showLogOnScreen(`❌ Critical error processing certification results: ${error.message}`);
    }
  }

  /**
   * Calculate certification status for a device based on discrepancy
   * @param {string} deviceId - Device identifier
   * @param {Array} deviceData - Array of verification readings
   * @returns {Object} Certification result object
   */
  calculateDeviceCertification(deviceId, deviceData) {
    // Input validation
    if (!deviceId || typeof deviceId !== 'string') {
      console.error('Invalid device ID provided to calculateDeviceCertification');
      return {
        certified: false,
        reason: 'Invalid device ID provided',
        averageDiscrepancy: '0.0',
        totalReadings: 0,
      };
    }

    if (!deviceData || !Array.isArray(deviceData) || deviceData.length === 0) {
      return {
        certified: false,
        reason: 'No verification data available',
        averageDiscrepancy: '0.0',
        totalReadings: 0,
      };
    }

    // Calculate average discrepancy across all pressure points
    let totalDiscrepancy = 0;
    let validReadings = 0;

    deviceData.forEach((reading, index) => {
      if (
        reading &&
        typeof reading === 'object' &&
        reading.flukePressure !== undefined &&
        reading.krakenPressure !== undefined &&
        typeof reading.flukePressure === 'number' &&
        typeof reading.krakenPressure === 'number'
      ) {
        const discrepancy = Math.abs(reading.krakenPressure - reading.flukePressure);
        totalDiscrepancy += discrepancy;
        validReadings++;
      } else {
        console.warn(`Invalid reading data at index ${index} for device ${deviceId}:`, reading);
      }
    });

    if (validReadings === 0) {
      return {
        certified: false,
        reason: 'No valid readings available',
        averageDiscrepancy: '0.0',
        totalReadings: 0,
      };
    }

    const averageDiscrepancy = totalDiscrepancy / validReadings;
    const certified = averageDiscrepancy <= KRAKEN_CONSTANTS.DISCREPANCY_TOLERANCE;

    return {
      certified,
      averageDiscrepancy: averageDiscrepancy.toFixed(1),
      reason: certified ? 'Passed certification criteria' : `Failed: Average discrepancy (${averageDiscrepancy.toFixed(1)} PSI) exceeds ${KRAKEN_CONSTANTS.DISCREPANCY_TOLERANCE} PSI`,
      totalReadings: validReadings,
    };
  }

  /**
   * Generate PDF report for a device using the dedicated PDF service
   */
  async generateDevicePDF(device, deviceData, certificationResult) {
    try {
      const result = await this.pdfService.generateKrakenPDF(device, deviceData, certificationResult, this.testerName);

      if (result.success) {
        // Store PDF path in global state for download functionality
        this.globalState.setDevicePDFPath(device.id, result.filePath);
        console.log(`PDF generated successfully for device ${device.id}: ${result.filePath}`);
        return { success: true, filePath: result.filePath };
      } else {
        throw new Error(result.error || 'PDF generation failed');
      }
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Error generating PDF for device ${device.id}:`, error);
      this.showLogOnScreen(`⚠️ Warning: Failed to generate PDF for ${device.displayName || device.id}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

export { KrakenVerificationService };
