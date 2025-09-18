import { getTelnetClient } from './telnet-client.service.js';
import * as FlukeUtil from '../utils/fluke.utils.js';
import { addDelay } from '../../shared/helpers/calibration-helper.js';

import * as Sentry from '@sentry/electron/main';

/**
 * Fluke Manager
 * Manages all interactions with the Fluke calibration device via Telnet.
 */
export class FlukeManager {
  constructor(showLogOnScreen, isProcessActiveFn) {
    this.showLogOnScreen = showLogOnScreen;
    this.isProcessActive = isProcessActiveFn; // Function to check if calibration/verification is active
    this.telnetClient = getTelnetClient();
  }

  /**
   * Update the process active function (used when reusing Fluke service instances)
   * @param {Function} isProcessActiveFn - New process active function
   */
  updateProcessActiveFunction(isProcessActiveFn) {
    this.isProcessActive = isProcessActiveFn;
    console.log('FlukeManager: Process active function updated, current status:', this.isProcessActive());
  }

  async connect() {
    let log = '';
    log = 'Connecting to Telnet server...';
    this.showLogOnScreen(log);
    if (this.telnetClient.isConnected) {
      log = 'Telnet already connected.';
      this.showLogOnScreen(log);
      return { success: true, message: log };
    }

    try {
      let response = await this.telnetClient.connect();
      this.showLogOnScreen(response.message);
      return response;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'fluke-manager', method: 'connect' },
      });
      const errorMessage = error.error || error.message || 'Unknown connection error';
      log = `❌ Failed to connect to Fluke: ${errorMessage}`;
      this.showLogOnScreen(log);

      // Show user-friendly message
      if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('connection timeout')) {
        this.showLogOnScreen('⚠️ Connection timeout - Please check if Fluke device is powered on and network connection is available.');
      } else if (errorMessage.includes('ECONNREFUSED')) {
        this.showLogOnScreen('⚠️ Connection refused - Please check if Fluke device is accessible on the network.');
      } else if (errorMessage.includes('not responding')) {
        this.showLogOnScreen('⚠️ Fluke device is not responding - Please verify IP address and port settings.');
      } else {
        this.showLogOnScreen(`⚠️ Connection failed: ${errorMessage}`);
      }

      return { success: false, error: errorMessage, message: log };
    }
  }

  async runPreReqs() {
    const commands = [
      {
        check: FlukeUtil.flukeCheckOutputStateCommand,
        validate: response => response === '1',
        action: FlukeUtil.flukeSetOutputStateCommand,
        name: 'Output State',
        expectedValue: '1',
      },
      {
        check: FlukeUtil.flukeCheckOutputPressureModeCommand,
        validate: response => response.toUpperCase() === 'CONTROL',
        action: FlukeUtil.flukeSetOutputPressureModeControlCommand,
        name: 'Output Mode',
        expectedValue: 'CONTROL',
      },
      {
        check: FlukeUtil.flukeCheckStaticModeCommand,
        validate: response => response === '0',
        action: FlukeUtil.flukeSetStaticModeCommand,
        name: 'Static Mode',
        expectedValue: '0',
      },
      {
        check: FlukeUtil.flukeCheckToleranceCommand,
        validate: response => parseFloat(response) === FlukeUtil.flukeTolerance,
        action: FlukeUtil.flukeSetToleranceCommand,
        name: 'Tolerance',
        expectedValue: FlukeUtil.flukeTolerance.toString(),
      },
    ];

    for (const command of commands) {
      if (!this.isProcessActive()) return;

      await addDelay(1000);
      this.showLogOnScreen(`Checking ${command.name}...`);

      if (!this.isProcessActive()) return;

      const initialResponse = await this.telnetClient.sendCommand(command.check);

      if (!command.validate(initialResponse)) {
        if (!this.isProcessActive()) return;

        // Send the setting command
        await this.telnetClient.sendCommand(command.action);
        await addDelay(1000);

        if (!this.isProcessActive()) return;

        // Verify the setting was applied correctly
        const verificationResponse = await this.telnetClient.sendCommand(command.check);

        if (!command.validate(verificationResponse)) {
          const errorMessage = `❌ Failed to set ${command.name}. Expected: ${command.expectedValue}, Got: ${verificationResponse}`;
          this.showLogOnScreen(errorMessage);
          throw new Error(`Fluke calibrator setup failed: ${errorMessage}`);
        } else {
          this.showLogOnScreen(`✅ ${command.name} configured`);
        }
      } else {
        this.showLogOnScreen(`✅ ${command.name} already set correctly.`);
      }
    }

    this.showLogOnScreen('All commands executed.');
  }

  async checkZeroPressure() {
    try {
      this.showLogOnScreen('Checking zero pressure...');
      const response = await this.telnetClient.sendCommand(FlukeUtil.flukeGetPressureCommand);
      const pressure = parseFloat(response).toFixed(1);

      if (pressure < FlukeUtil.flukeTolerance) {
        this.showLogOnScreen('Pressure already set to 0');
        return true; // Pressure is already at zero
      } else {
        this.showLogOnScreen(`Current pressure: ${pressure} PSI`);
        return false; // Pressure needs to be set to zero
      }
    } catch (error) {
      Sentry.captureException(error);
      const errorMessage = error.error || error.message || 'Unknown error';
      this.showLogOnScreen(`❌ Failed to check pressure: ${errorMessage}`);
      throw new Error(`Pressure check failed: ${errorMessage}`);
    }
  }

  setZeroPressureToFluke(silent = false) {
    if (!silent) {
      this.showLogOnScreen('🔄 Setting Fluke to zero pressure...');
    }
    this.telnetClient.sendCommand(`${FlukeUtil.flukeSetPressureCommand} 0`);
  }

  async setZeroPressureToFlukeWithVerification() {
    this.showLogOnScreen('Setting pressure to 0 PSI...');
    this.setZeroPressureToFluke(true);

    // Wait for pressure to stabilize
    await this.waitForFlukeToReachZeroPressure(true);

    // Verify the pressure was actually set to 0
    const verificationResponse = await this.telnetClient.sendCommand(FlukeUtil.flukeGetPressureCommand);
    const verificationPressure = parseFloat(verificationResponse).toFixed(1);

    if (verificationPressure >= FlukeUtil.flukeTolerance) {
      const errorMessage = `❌ Failed to set pressure to 0. Expected: <${FlukeUtil.flukeTolerance}, Got: ${verificationPressure}`;
      this.showLogOnScreen(errorMessage);
      throw new Error(`Fluke zero pressure setting failed: ${errorMessage}`);
    } else {
      this.showLogOnScreen(`✅ Pressure successfully set to 0 and verified (${verificationPressure} PSI).`);
    }
  }

  async ensureZeroPressure() {
    try {
      const isZeroPressure = await this.checkZeroPressure();

      if (!isZeroPressure) {
        this.setZeroPressureToFluke();
        await this.waitForFlukeToReachZeroPressure();
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'fluke-manager', method: 'ensureZeroPressure' },
      });
      // const errorMessage = error.error || error.message || 'Unknown error';
      // this.showLogOnScreen(`❌ Failed to ensure zero pressure: ${errorMessage}`);
      // throw new Error(`Zero pressure setup failed: ${errorMessage}`);
    }
  }

  setHighPressureToFluke(sweepValue, silent = false) {
    if (!silent) {
      this.showLogOnScreen(`Setting pressure (${sweepValue}) to fluke...`);
    }
    this.telnetClient.sendCommand(`${FlukeUtil.flukeSetPressureCommand} ${sweepValue}`);
  }

  async setHighPressureToFlukeWithVerification(sweepValue) {
    this.showLogOnScreen(`Setting high pressure to ${sweepValue} PSI...`);
    this.setHighPressureToFluke(sweepValue, true);

    // Wait for pressure to stabilize
    await this.waitForFlukeToReachTargetPressure(sweepValue);

    // Verify the pressure was actually set correctly
    const verificationResponse = await this.telnetClient.sendCommand(FlukeUtil.flukeGetPressureCommand);
    const verificationPressure = parseFloat(verificationResponse).toFixed(1);
    const targetPressure = parseFloat(sweepValue).toFixed(1);

    // Allow for small tolerance in pressure setting (±0.5 PSI)
    const pressureTolerance = 0.5;
    const pressureDifference = Math.abs(verificationPressure - targetPressure);

    if (pressureDifference > pressureTolerance) {
      const errorMessage = `❌ Failed to set pressure to ${sweepValue} PSI. Expected: ${targetPressure}, Got: ${verificationPressure}, Difference: ${pressureDifference.toFixed(1)}`;
      this.showLogOnScreen(errorMessage);
      throw new Error(`Fluke high pressure setting failed: ${errorMessage}`);
    }
  }

  async waitForFlukeToReachZeroPressure(silent = false) {
    return new Promise((resolve, reject) => {
      let check = setInterval(async () => {
        if (!this.isProcessActive()) {
          clearInterval(check);
          reject(new Error('Process stopped'));
          return;
        }

        const response = await this.telnetClient.sendCommand(FlukeUtil.flukeStatusOperationCommand);
        if (response === '16') {
          if (!silent) {
            this.showLogOnScreen('✅ Fluke reached zero pressure');
          }
          clearInterval(check);
          resolve();
        }
      }, 2000);
    });
  }

  async waitForFlukeToReachTargetPressure(targetPressure) {
    return new Promise((resolve, reject) => {
      let check = setInterval(async () => {
        if (!this.isProcessActive()) {
          clearInterval(check);
          reject(new Error('Process stopped'));
          return;
        }

        const response = await this.telnetClient.sendCommand(FlukeUtil.flukeStatusOperationCommand);
        if (response === '16') {
          this.showLogOnScreen(`Pressure set to ${targetPressure}`);
          clearInterval(check);
          resolve();
        }
      }, 2000);
    });
  }

  async checkFlukeResponsiveness() {
    try {
      const response = await Promise.race([this.telnetClient.sendCommand('*IDN?'), new Promise((_, reject) => setTimeout(() => reject(new Error('Fluke not responding')), 5000))]);

      return response && response.length > 0;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'fluke-manager', method: 'isFlukeResponsive' },
      });
      console.warn('Fluke responsiveness check failed:', error.message);
      return false;
    }
  }

  async disconnect() {
    if (this.telnetClient && this.telnetClient.isConnected) {
      await this.telnetClient.disconnect();
      console.log('Fluke disconnected successfully');
    }
  }
}
