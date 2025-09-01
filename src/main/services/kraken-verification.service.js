import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
// import { UART_service } from './uart-service.js';
import { addDelay } from '../../shared/helpers/calibration-helper.js';
// import { parsePressureData } from '../utils/ble.utils.js';

import { generateStepArray } from '../utils/kraken-calibration.utils.js';

// const VERIFICATION_SWEEP_POINTS = generateStepArray(100);

class KrakenVerificationService {
  constructor(globalState, flukeManager, sendToRenderer, showLogOnScreen) {
    this.globalState = globalState;
    this.fluke = flukeManager;
    this.sendToRenderer = sendToRenderer;
    this.showLogOnScreen = showLogOnScreen;
    this.isSweepRunning = false;
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
    const pressurePoints = generateStepArray(KRAKEN_CONSTANTS.SWEEP_VALUE);
    const totalPoints = pressurePoints.length;

    for (let i = 0; i < pressurePoints.length; i++) {
      const targetPressure = pressurePoints[i];
      if (!this.isSweepRunning) {
        this.showLogOnScreen('⏹️ Verification sweep was cancelled.');
        break;
      }

      // Send progress update
      this.sendSweepProgressUpdate(i + 1, totalPoints);

      await this.setFlukeAndCaptureReadings(targetPressure);
    }

    if (this.isSweepRunning) {
      this.showLogOnScreen('✅ Verification sweep completed successfully.');
      this.sendToRenderer('kraken-verification-sweep-completed', this.globalState.getKrakenSweepData());
    }

    this.isSweepRunning = false;
  }

  /**
   * Sets the Fluke to a target pressure, waits, and captures Kraken readings.
   * @param {number} targetPressure - The pressure to set on the Fluke.
   */
  async setFlukeAndCaptureReadings(targetPressure) {
    try {
      this.showLogOnScreen(`⚙️ Setting Fluke to ${targetPressure.toFixed(2)} PSI...`);

      if (targetPressure === 0) {
        await this.fluke.setZeroPressureToFluke();
        await this.fluke.waitForFlukeToReachZeroPressure();
      } else {
        await this.fluke.setHighPressureToFluke(targetPressure);
        await this.fluke.waitForFlukeToReachTargetPressure(targetPressure);
      }

      this.showLogOnScreen(`✅ Fluke reached ${targetPressure.toFixed(2)} PSI. Stabilizing...`);
      
      // Send current Fluke pressure to renderer for display
      this.sendToRenderer('update-kraken-calibration-reference-pressure', targetPressure);
      
      await addDelay(KRAKEN_CONSTANTS.DELAY_AFTER_PRESSURE_SET);

      this.showLogOnScreen('📸 Capturing latest pressure readings from Krakens...');
      const devices = this.globalState.getConnectedDevices();

      // Capture multiple readings for each device to ensure accuracy
      const captureAttempts = 3;
      const captureDelay = 1000; // 1 second between captures

      for (const device of devices) {
        let readings = [];

        // Capture multiple readings
        for (let attempt = 1; attempt <= captureAttempts; attempt++) {
          await addDelay(captureDelay);

          // Get the latest pressure reading from global state (which is continuously updated via BLE)
          const latestPressure = this.globalState.getDevicePressure(device.id);
          if (latestPressure !== null) {
            readings.push(latestPressure);
            this.showLogOnScreen(`  - ${device.name || device.id}: Reading ${attempt}: ${latestPressure.toFixed(2)} PSI`);
          } else {
            this.showLogOnScreen(`  - ⚠️ ${device.name || device.id}: No reading available for attempt ${attempt}.`);
          }
        }

        // Use the average of all readings if available
        if (readings.length > 0) {
          const averagePressure = readings.reduce((sum, reading) => sum + reading, 0) / readings.length;

          this.globalState.addKrakenSweepData(device.id, {
            flukePressure: targetPressure,
            krakenPressure: averagePressure,
            timestamp: Date.now(),
            readings: readings, // Store all readings for reference
          });

          this.showLogOnScreen(`  - ✅ ${device.name || device.id}: Average: ${averagePressure.toFixed(2)} PSI (${readings.length} readings)`);

          // Send real-time update to renderer for this pressure point
          this.updateKrakenVerificationTable(device.id, targetPressure, averagePressure, readings);
          
          // Send Kraken pressure update to renderer
          this.sendToRenderer('update-kraken-pressure', {
            deviceId: device.id,
            deviceName: device.name || device.id,
            pressure: averagePressure
          });
        } else {
          this.showLogOnScreen(`  - ❌ ${device.name || device.id}: No valid readings captured.`);
        }
      }
    } catch (error) {
      this.showLogOnScreen(`❌ Error during verification at ${targetPressure} PSI: ${error.message}`);
      console.error(`Error at pressure ${targetPressure}:`, error);
      // Stop the sweep on a critical Fluke error
      this.isSweepRunning = false;
    }
  }

  /**
   * Stops the currently running verification sweep.
   */
  stopVerification() {
    this.isSweepRunning = false;
    this.showLogOnScreen('Verification process stopped by user.');
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
   * Send sweep progress update to renderer
   * @param {number} currentPressure - Current pressure point being processed
   * @param {number} totalPoints - Total pressure points in sweep
   */
  sendSweepProgressUpdate(currentPressure, totalPoints) {
    const progress = Math.round((currentPressure / totalPoints) * 100);
    this.sendToRenderer('kraken-verification-progress-update', {
      currentPressure,
      totalPoints,
      progress,
      isRunning: this.isSweepRunning,
    });
  }
}

export { KrakenVerificationService };
