import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import { GLOBAL_CONSTANTS } from '../../config/constants/global.constants.js';
import { addDelay } from '../../shared/helpers/calibration-helper.js';
import { UART_service } from '../services/uart-service.js';

import * as Sentry from '@sentry/electron/main';

/**
 * Kraken Calibration Manager
 * Handles the Kraken calibration process, command sending, and device management during calibration
 */
export class KrakenCalibrationManager {
  constructor(globalState, flukeManager, sendToRenderer, showLogOnScreen) {
    this.globalState = globalState;
    this.flukeManager = flukeManager;
    this.sendToRenderer = sendToRenderer;
    this.showLogOnScreen = showLogOnScreen;
  }

  async calibrateAllSensors() {
    try {
      await this.sendZeroCommandToAllSensors();
      await addDelay(KRAKEN_CONSTANTS.DELAY_BETWEEN_COMMANDS);
      await this.sendLowCommandToAllSensors();
      await addDelay(KRAKEN_CONSTANTS.DELAY_BETWEEN_COMMANDS);
      await this.sendHighCommandToAllSensors();
      await addDelay(KRAKEN_CONSTANTS.DELAY_BETWEEN_COMMANDS);
      await this.markSensorsAsCalibrated();
    } catch (error) {
      console.error('Error calibrating sensors:', error);

      // Stop calibration and restore UI (notification handled in stopCalibration)
      await this.stopCalibration('Calibration process failed', error.message);

      // Re-throw the error to prevent continuation of the main calibration flow
      throw error;
    }
  }

  async markSensorsAsCalibrated() {
    for (const device of this.globalState.getConnectedDevices()) {
      this.globalState.setDeviceCalibrated(device.id);
    }
  }

  /**
   * Generic method to send commands to all sensors with specific logging and error handling
   * @param {string} commandType - Type of command ('zero', 'low', 'high')
   * @param {Function} commandFunction - Function to execute for each device
   * @param {string} startMessage - Starting log message
   * @param {string} endMessage - Completion log message
   * @param {Function} [beforeDeviceLoop] - Optional function to run before device loop
   * @returns {Promise<void>}
   */
  async sendCommandToAllSensors(commandType, commandFunction, startMessage, endMessage, beforeDeviceLoop = null) {
    this.showLogOnScreen(startMessage);

    const devicesToRemove = [];
    const connectedDevices = [...this.globalState.getConnectedDevices()]; // Create a copy to avoid iteration issues

    // Execute any pre-processing (like Fluke setup for high commands)
    if (beforeDeviceLoop) {
      await beforeDeviceLoop();
    }

    for (const device of connectedDevices) {
      try {
        // TODO: implement device retry connect logic
        // Check if device is still connected before sending command
        if (!this.isDeviceConnectedInGlobalState(device.id)) {
          this.showLogOnScreen(`⚠️ Device ${device.name || device.id} is not connected, skipping ${commandType} command`);

          // Update device widget to show disconnected state immediately
          this.sendToRenderer('device-calibration-status-update', {
            deviceId: device.id,
            isCalibrating: false,
            hasError: true,
            message: 'Calibration failed',
          });

          devicesToRemove.push(device.id);
          continue;
        }

        const success = await commandFunction(device);
        if (!success) {
          // Update device widget to show failed state immediately
          this.sendToRenderer('device-calibration-status-update', {
            deviceId: device.id,
            isCalibrating: false,
            hasError: true,
            message: 'Calibration failed',
          });
          devicesToRemove.push(device.id);
        } else {
          await addDelay(1000);
        }
      } catch (error) {
        console.error(`${commandType} command failed for device ${device.name || device.id}:`, error.message);
        this.showLogOnScreen(`❌ ${commandType} command failed for ${device.name || device.id}: ${error.message}`);

        // Special handling for critical Fluke failures in high command
        if (commandType === 'High' && (error.message.includes('Fluke is not responding') || error.message.includes('timeout'))) {
          await this.stopCalibration('Critical Fluke communication failure during high pressure operation', error.message);
          throw new Error('Critical Fluke failure during high pressure operation');
        }

        // Update device widget to show failed state immediately
        this.sendToRenderer('device-calibration-status-update', {
          deviceId: device.id,
          isCalibrating: false,
          hasError: true,
          message: 'Calibration failed',
        });

        devicesToRemove.push(device.id);
      }
    }

    // Remove failed devices
    await this.removeFailedDevicesFromCalibration(devicesToRemove, `${commandType.toLowerCase()} command`);
    this.showLogOnScreen(endMessage);
  }

  async sendZeroCommandToAllSensors() {
    return this.sendCommandToAllSensors(
      'Zero',
      this.writeZeroToSensorWithRetries.bind(this),
      '🔄 STARTING ZERO COMMAND CALIBRATION-----------------',
      '✅ ZERO COMMAND CALIBRATION COMPLETED---------------'
    );
  }

  async sendLowCommandToAllSensors() {
    return this.sendCommandToAllSensors(
      'Low',
      this.writeLowToSensorWithRetries.bind(this),
      '🔄 STARTING LOW COMMAND CALIBRATION-----------------',
      '✅ LOW COMMAND CALIBRATION COMPLETED--------------'
    );
  }

  async sendHighCommandToAllSensors() {
    const flukeSetup = async () => {
      try {
        await this.flukeManager.setHighPressureToFlukeWithVerification(this.sweepValue);
        this.showLogOnScreen(`✅ Fluke set to ${this.sweepValue} PSI for all high commands`);
      } catch (error) {
        Sentry.captureException(error);
        this.showLogOnScreen(`❌ Failed to set Fluke to high pressure: ${error.message}`);
        await this.stopCalibration('Critical Fluke communication failure during high pressure setup', error.message);
        throw new Error('Critical Fluke failure during high pressure setup');
      }
    };

    return this.sendCommandToAllSensors(
      'High',
      this.writeHighToSensorWithRetries.bind(this),
      '🔄 STARTING HIGH COMMAND CALIBRATION-----------------',
      '✅ HIGH COMMAND CALIBRATION COMPLETED--------------',
      flukeSetup
    );
  }

  /**
   * Check if device is connected in global state
   * @param {string} deviceId - Device ID to check
   * @returns {boolean} True if device is connected
   */
  isDeviceConnectedInGlobalState(deviceId) {
    const device = this.globalState.connectedDevices.get(deviceId);
    if (!device) {
      return false;
    }

    // Check if peripheral exists and is connected
    const isPeripheralConnected = device.peripheral && device.peripheral.state === 'connected';

    // Check if device status is ready or in-progress (not failed or disconnected)
    const deviceStatus = this.globalState.getDeviceStatus(deviceId);
    const isStatusValid = deviceStatus && !['failed', 'disconnected'].includes(deviceStatus.status);

    return isPeripheralConnected && isStatusValid;
  }

  /**
   * Write zero command to sensor with retries
   * @param {Object} device - Device object
   * @returns {Promise<boolean>} Success status
   */
  async writeZeroToSensorWithRetries(device) {
    const deviceName = device.name || device.id;

    try {
      this.showLogOnScreen(`Starting psi.calibrate.zero command for ${deviceName}...`);
      await UART_service(device, 'psi.calibrate.zero');
      return true;
    } catch (error) {
      // Check if this is a device disconnection error
      if (error.message.startsWith('DEVICE_DISCONNECTED:')) {
        this.showLogOnScreen(`🔌 Device ${deviceName} disconnected during zero command - removing from calibration`);
        // Remove device from calibration immediately
        await this.removeDisconnectedDeviceFromCalibration(device.id);
        return false;
      }

      console.error(`Zero command failed for ${deviceName}:`, error.message);
      this.showLogOnScreen(`❌ Zero command failed for ${deviceName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Write low command to sensor with retries
   * @param {Object} device - Device object
   * @returns {Promise<boolean>} Success status
   */
  async writeLowToSensorWithRetries(device) {
    const deviceName = device.name || device.id;

    try {
      this.showLogOnScreen(`Starting psi.calibrate.lower command for ${deviceName}...`);
      await UART_service(device, 'psi.calibrate.lower', 0);
      return true;
    } catch (error) {
      // Check if this is a device disconnection error
      if (error.message.startsWith('DEVICE_DISCONNECTED:')) {
        this.showLogOnScreen(`🔌 Device ${deviceName} disconnected during low command - removing from calibration`);
        // Remove device from calibration immediately
        await this.removeDisconnectedDeviceFromCalibration(device.id);
        return false;
      }

      console.error(`Low command failed for ${deviceName}:`, error.message);
      this.showLogOnScreen(`❌ Low command failed for ${deviceName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Write high command to sensor with retries (Fluke pressure already set)
   * @param {Object} device - Device object
   * @returns {Promise<boolean>} Success status
   */
  async writeHighToSensorWithRetries(device) {
    const deviceName = device.name || device.id;

    try {
      this.showLogOnScreen(`Starting psi.calibrate.upper command for ${deviceName}...`);
      await UART_service(device, 'psi.calibrate.upper', undefined, this.sweepValue * 1000);
      return true;
    } catch (error) {
      // Check if this is a device disconnection error
      if (error.message.startsWith('DEVICE_DISCONNECTED:')) {
        this.showLogOnScreen(`🔌 Device ${deviceName} disconnected during high command - removing from calibration`);
        // Remove device from calibration immediately
        await this.removeDisconnectedDeviceFromCalibration(device.id);
        return false;
      }

      console.error(`High command failed for ${deviceName}:`, error.message);
      this.showLogOnScreen(`❌ High command failed for ${deviceName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Remove a single disconnected device from calibration immediately
   * @param {string} deviceId - Device ID to remove
   */
  async removeDisconnectedDeviceFromCalibration(deviceId) {
    const device = this.globalState.connectedDevices.get(deviceId);
    const deviceName = device ? device.name || device.id : deviceId;

    try {
      this.showLogOnScreen(`🗑️ Removing disconnected device: ${deviceName}`);

      // Update device widget to show disconnected/failed state before removal
      this.sendToRenderer('device-calibration-status-update', {
        deviceId,
        isCalibrating: false,
        hasError: true,
        message: 'Calibration failed',
      });

      // Clean up device subscriptions
      await this.globalState.cleanupDeviceSubscription(deviceId);

      // Remove from all tracking
      this.globalState.connectedDevices.delete(deviceId);
      this.globalState.deviceSetupStatus.delete(deviceId);
      this.globalState.deviceRetryCount.delete(deviceId);
      this.globalState.deviceCharacteristics.delete(deviceId);
      this.globalState.activeSubscriptions.delete(deviceId);

      // Update setup queue
      const queueIndex = this.globalState.setupQueue.indexOf(deviceId);
      if (queueIndex > -1) {
        this.globalState.setupQueue.splice(queueIndex, 1);
      }

      // Send removal event to renderer
      this.sendToRenderer('device-removed-from-calibration', {
        deviceId,
        deviceName,
        reason: 'Device disconnected during calibration',
      });

      console.log(`Device ${deviceName} removed from calibration due to disconnection`);
    } catch (error) {
      console.error(`Error removing disconnected device ${deviceName}:`, error);
      this.showLogOnScreen(`⚠️ Error removing ${deviceName}: ${error.message}`);
    }
  }

  /**
   * Remove failed devices from calibration and connected devices
   * @param {string[]} deviceIds - Array of device IDs to remove
   * @param {string} commandType - Type of command that failed (for logging)
   */
  async removeFailedDevicesFromCalibration(deviceIds, commandType) {
    if (deviceIds.length === 0) {
      return;
    }

    for (const deviceId of deviceIds) {
      const device = this.globalState.connectedDevices.get(deviceId);
      const deviceName = device ? device.name || device.id : deviceId;

      try {
        // Log the removal
        this.showLogOnScreen(`🗑️ Removing ${deviceName} - Failed ${commandType} after ${GLOBAL_CONSTANTS.MAX_RETRIES} retries`);

        // Clean up device subscriptions
        await this.globalState.cleanupDeviceSubscription(deviceId);

        // Remove from all tracking
        this.globalState.connectedDevices.delete(deviceId);
        this.globalState.deviceSetupStatus.delete(deviceId);
        this.globalState.deviceRetryCount.delete(deviceId);
        this.globalState.deviceCharacteristics.delete(deviceId);
        this.globalState.activeSubscriptions.delete(deviceId);

        // Update setup queue
        const queueIndex = this.globalState.setupQueue.indexOf(deviceId);
        if (queueIndex > -1) {
          this.globalState.setupQueue.splice(queueIndex, 1);
        }

        // Send removal event to renderer
        this.sendToRenderer('device-removed-from-calibration', {
          deviceId,
          deviceName,
          reason: `Failed ${commandType} after ${GLOBAL_CONSTANTS.MAX_RETRIES} retries`,
        });

        console.log(`Device ${deviceName} removed from calibration due to failed ${commandType}`);
      } catch (error) {
        console.error(`Error removing device ${deviceName}:`, error);
        this.showLogOnScreen(`⚠️ Error removing ${deviceName}: ${error.message}`);
      }
    }

    // Send consolidated notification for removed devices
    if (deviceIds.length > 0) {
      this.sendToRenderer('show-notification', {
        type: 'warning',
        message: `${deviceIds.length} device(s) removed from calibration due to ${commandType} failures. Check logs for details.`,
      });
    }

    // Check if we still have devices to continue with
    const remainingDevices = this.globalState.getConnectedDevices();
    if (remainingDevices.length === 0) {
      this.showLogOnScreen(`❌ No devices remaining for calibration. Stopping process.`);
      await this.stopCalibration('All devices failed calibration commands');
      throw new Error('All devices failed calibration commands');
    } else {
      this.showLogOnScreen(`✅ Continuing calibration with ${remainingDevices.length} remaining devices`);
    }
  }

  /**
   * Stop calibration process and show user notification
   * @param {string} reason - Reason for stopping calibration
   * @param {string} errorDetails - Additional error details
   * @param {boolean} resetToNotCalibrated - Whether to reset devices to "Not Calibrated" state (for retry)
   */
  async stopCalibration(reason, errorDetails = '', resetToNotCalibrated = false) {
    try {
      console.log(`Stopping calibration: ${reason}`);

      // Update global state
      this.globalState.isCalibrationActive = false;

      // Show stop notification in logs
      this.showLogOnScreen(`🛑 CALIBRATION STOPPED: ${reason}`);
      if (errorDetails) {
        this.showLogOnScreen(`Error details: ${errorDetails}`);
      }

      // Restore UI state - enable buttons and hide stop button
      this.sendToRenderer('enable-kraken-calibration-button'); // Re-enable after stop
      this.sendToRenderer('enable-kraken-back-button');
      this.sendToRenderer('hide-kraken-stop-calibration-button');

      // Update device widgets based on reset preference
      if (resetToNotCalibrated) {
        // Reset to "Not Calibrated" state for retry
        this.resetDeviceWidgetsToNotCalibrated();
      } else {
        // Show calibration failed state
        this.updateDeviceWidgetsForCalibration(false, true);
      }

      // Also update calibration button state to re-enable it
      this.sendToRenderer('update-calibration-button-state', {
        enabled: true,
        deviceCount: this.globalState.getConnectedDevices().length,
      });

      // Send appropriate notification to user
      const isUserRequestedStop = reason === 'Calibration stopped';
      this.sendToRenderer('show-notification', {
        type: isUserRequestedStop ? 'info' : 'error',
        message: isUserRequestedStop ? 'Calibration stopped' : `Calibration failed: ${reason}`,
      });
    } catch (error) {
      console.error('Error stopping calibration:', error);
      // Even if cleanup fails, ensure UI is restored
      this.sendToRenderer('enable-kraken-calibration-button'); // Ensure re-enabled even on error
      this.sendToRenderer('enable-kraken-back-button');
      this.sendToRenderer('hide-kraken-stop-calibration-button');

      // Update device widgets based on reset preference (error during stop)
      if (resetToNotCalibrated) {
        // Reset to "Not Calibrated" state for retry
        this.resetDeviceWidgetsToNotCalibrated();
      } else {
        // Show calibration failed state
        this.updateDeviceWidgetsForCalibration(false, true);
      }

      // Also update calibration button state to re-enable it
      this.sendToRenderer('update-calibration-button-state', {
        enabled: true,
        deviceCount: this.globalState.getConnectedDevices().length,
      });
    }
  }

  /**
   * Update all device widgets to show calibration status
   * @param {boolean} isCalibrating - Whether calibration is in progress
   */
  updateDeviceWidgetsForCalibration(isCalibrating, hasError = false) {
    const devices = this.globalState.getConnectedDevices();

    for (const device of devices) {
      if (isCalibrating) {
        // Update device status to show calibration in progress
        this.globalState.updateDeviceStatus(device.id, 'calibrating', 'active', 'Device is being calibrated...');
      } else if (hasError) {
        // Update device to error state after calibration failure
        this.globalState.updateDeviceStatus(device.id, 'failed', 'error', 'Calibration failed');
      } else {
        // Restore device to ready state after successful calibration
        this.globalState.updateDeviceStatus(device.id, 'ready', 'complete', null);
      }

      // Send widget update to renderer
      let message;
      if (isCalibrating) {
        message = 'Calibration in progress...';
      } else if (hasError) {
        message = 'Calibration failed - error occurred';
      } else {
        message = 'Ready for verification';
      }

      this.sendToRenderer('device-calibration-status-update', {
        deviceId: device.id,
        isCalibrating: isCalibrating,
        hasError: hasError,
        message: message,
      });
    }
  }

  /**
   * Reset device widgets to their original "Not Calibrated" state
   * Used when calibration fails and we want to allow retry
   */
  resetDeviceWidgetsToNotCalibrated() {
    const devices = this.globalState.getConnectedDevices();

    for (const device of devices) {
      // Reset device status to ready (not calibrated)
      this.globalState.updateDeviceStatus(device.id, 'ready', 'waiting', null);

      // Send widget update to renderer with "Not Calibrated" state
      this.sendToRenderer('device-calibration-status-update', {
        deviceId: device.id,
        isCalibrating: false,
        hasError: false,
        message: 'Not Calibrated',
      });
    }
  }
}
