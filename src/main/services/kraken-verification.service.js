import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import { addDelay } from '../../shared/helpers/calibration-helper.js';
import { generateStepArray } from '../utils/kraken-calibration.utils.js';

import * as Sentry from '@sentry/electron/main';

class KrakenVerificationService {
  constructor(globalState, flukeManager, sendToRenderer, showLogOnScreen) {
    this.globalState = globalState;
    this.fluke = flukeManager;
    this.sendToRenderer = sendToRenderer;
    this.showLogOnScreen = showLogOnScreen;
    this.isSweepRunning = false;
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

    const devices = this.globalState.getConnectedDevices();
    if (devices.length === 0) {
      this.showLogOnScreen('❌ No connected devices found for verification.');
      this.isSweepRunning = false;
      return;
    }

    // Assume all devices have same pressure range, use the first one.
    const pressurePoints = generateStepArray(100);

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
        this.sendToRenderer('kraken-verification-sweep-completed', this.globalState.getKrakenSweepData());
      }
    } catch (error) {
      Sentry.captureException(error);
      this.showLogOnScreen(`❌ Error during verification sweep: ${error.message}`);
      console.error('Error during verification sweep:', error);
    } finally {
      // Always set Fluke to zero pressure after verification completes or fails (silently)
      this.fluke.setZeroPressureToFluke(true);
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
      this.showLogOnScreen(`❌ Error during verification at ${targetPressure} PSI: ${error.message}`);
      console.error(`Error at pressure ${targetPressure}:`, error);
      // Stop the sweep on a critical Fluke error
      this.isSweepRunning = false;
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
}

export { KrakenVerificationService };
