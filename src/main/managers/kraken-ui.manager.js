import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';

/**
 * Kraken UI Manager
 * Handles Kraken UI state updates, button management, and renderer communication
 */
export class KrakenUIManager {
  constructor(mainWindow, globalState, sendToRenderer) {
    this.mainWindow = mainWindow;
    this.globalState = globalState;
    this.sendToRenderer = sendToRenderer;
  }

  /**
   * Format device data for renderer consumption
   * @param {Object} device - Raw device object
   * @returns {Object} Formatted device object
   */
  formatDeviceForRenderer(device) {
    const status = this.globalState.getDeviceStatus(device.id) || {
      status: 'pending',
      stage: 'waiting',
    };

    return {
      id: device.id,
      name: device.name,
      displayName: device.displayName || device.name,
      firmwareVersion: device.firmwareVersion || 'Unknown',
      minPressure: device.minPressure || 0,
      maxPressure: device.maxPressure || KRAKEN_CONSTANTS.MAX_PRESSURE,
      status: status.status,
      stage: status.stage,
      error: status.error,
    };
  }

  /**
   * Update overall progress summary and send to renderer
   */
  updateProgressSummary() {
    const progressData = this.globalState.getSetupProgress();
    this.sendToRenderer('progress-update', progressData);
  }

  /**
   * Update calibration button state based on device connectivity
   */
  updateCalibrationButtonState() {
    const devices = this.globalState.getConnectedDevices();
    const allDevicesReady =
      devices.length > 0 &&
      devices.every(device => {
        const status = this.globalState.getDeviceStatus(device.id);
        return (
          status?.status === 'ready' && device.peripheral && device.peripheral.state === 'connected'
        );
      });

    // Disable button if calibration is in progress
    const enabled = allDevicesReady && !this.globalState.isCalibrationActive;

    this.sendToRenderer('update-calibration-button-state', {
      enabled: enabled,
      deviceCount: devices.length,
    });
  }

  /**
   * Update all device widgets to show calibration status
   * @param {boolean} isCalibrating - Whether calibration is in progress
   * @param {boolean} hasError - Whether there was an error
   */
  updateDeviceWidgetsForCalibration(isCalibrating, hasError = false) {
    const devices = this.globalState.getConnectedDevices();

    for (const device of devices) {
      if (isCalibrating) {
        // Update device status to show calibration in progress
        this.globalState.updateDeviceStatus(
          device.id,
          'calibrating',
          'active',
          'Device is being calibrated...'
        );
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

  disableBackButton() {
    this.sendToRenderer('disable-kraken-back-button');
  }

  showAndEnableStopCalibrationButton() {
    this.sendToRenderer('show-kraken-stop-calibration-button');
    this.sendToRenderer('enable-kraken-stop-calibration-button');
  }

  hideResultsButton() {
    this.sendToRenderer('hide-kraken-results-button');
  }

  disableCalibrationButton() {
    this.sendToRenderer('disable-kraken-calibration-start-button');
  }

  clearCalibrationLogs() {
    this.sendToRenderer('clear-kraken-calibration-logs');
  }

  clearKrakenSweepData() {
    this.globalState.clearKrakenSweepData();
  }

  showLogOnScreen(log) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('kraken-calibration-logs-data', log);
    } else {
      console.log('Window is destroyed!');
    }
  }

  /**
   * Get current controller status
   * @returns {Object} Current state summary
   */
  getStatus() {
    return this.globalState.getStateSummary();
  }

  /**
   * Send message to renderer process
   * @param {string} channel - IPC channel name
   * @param {any} data - Data to send
   */
  sendToRenderer(channel, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}
