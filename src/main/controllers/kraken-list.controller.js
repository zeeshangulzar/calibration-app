import { getKrakenScanner } from '../services/kraken-scanner.service.js';
import { getKrakenConnection } from '../services/kraken-connection.service.js';
import { getKrakenCalibrationState } from '../../state/kraken-calibration-state.service.js';
import { getSignalStrengthInfo, KRAKEN_CONSTANTS } from '../constants/kraken.constants.js';

class KrakenListController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.scanner = getKrakenScanner();
    this.connection = getKrakenConnection();
    this.globalState = getKrakenCalibrationState();
    this.selectedDeviceIds = new Set();

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Scanner events
    this.scanner.on('bluetoothStateChanged', state => {
      this.handleBluetoothStateChange(state);
    });

    this.scanner.on('deviceDiscovered', device => {
      this.handleDeviceDiscovered(device);
    });

    this.scanner.on('deviceUpdated', device => {
      this.handleDeviceUpdated(device);
    });

    this.scanner.on('scanStarted', () => {
      this.sendToRenderer('scan-started');
    });

    this.scanner.on('scanStopped', () => {
      this.sendToRenderer('scan-stopped');
    });

    this.scanner.on('scanError', error => {
      this.sendToRenderer('scan-error', error.message);
    });

    // Connection events
    this.connection.on('connectionStarted', ({ deviceId }) => {
      this.sendToRenderer('connection-started', deviceId);
    });

    this.connection.on('deviceConnected', device => {
      this.sendToRenderer('device-connected', this.formatDeviceForRenderer(device));
    });

    this.connection.on('connectionFailed', ({ deviceId, error }) => {
      this.sendToRenderer('connection-failed', { deviceId, error });
    });

    // New sequential connection events
    this.connection.on('deviceConnectionStarted', data => {
      this.sendToRenderer('device-connection-started', data);
    });

    this.connection.on('deviceConnectionSuccess', data => {
      this.sendToRenderer('device-connection-success', data);
    });

    this.connection.on('deviceConnectionFailed', data => {
      this.sendToRenderer('device-connection-failed', data);
    });

    this.connection.on('deviceConnectionRetry', data => {
      this.sendToRenderer('device-connection-retry', data);
    });

    this.connection.on('multipleConnectionsComplete', results => {
      this.handleMultipleConnectionsComplete(results);
    });
  }

  handleBluetoothStateChange(state) {
    const isReady = state === 'poweredOn';
    this.sendToRenderer('bluetooth-state-changed', { state, isReady });

    if (!isReady) {
      this.sendToRenderer('show-bluetooth-error', true);
    } else {
      this.sendToRenderer('show-bluetooth-error', false);
      // Auto-start scanning when bluetooth is ready
      this.startScanning();
    }
  }

  handleDeviceDiscovered(device) {
    const formattedDevice = this.formatDeviceForRenderer(device);
    this.sendToRenderer('device-discovered', formattedDevice);
  }

  handleDeviceUpdated(device) {
    const formattedDevice = this.formatDeviceForRenderer(device);
    this.sendToRenderer('device-updated', formattedDevice);
  }

  handleMultipleConnectionsComplete(results) {
    this.sendToRenderer('hide-loader');

    const totalSelected = this.selectedDeviceIds.size;
    const successfulCount = results.successful.length;
    const failedCount = results.failed.length;

    console.log(
      `Connection complete: ${successfulCount}/${totalSelected} devices connected successfully`
    );

    // Validate connected devices first
    const validConnectedDevices = results.successful.filter(device => {
      return (
        device &&
        device.id &&
        device.connectionState === KRAKEN_CONSTANTS.CONNECTION_STATES.CONNECTED
      );
    });

    if (validConnectedDevices.length !== successfulCount) {
      console.warn('Some connected devices are not properly validated');
      // Add validation errors to the failed list
      const validationError = {
        id: 'validation-error',
        name: 'Device Validation',
        error: 'Some devices did not complete connection validation',
      };
      results.failed.push(validationError);
    }

    // Store validated connected devices in global state (so they're ready for navigation)
    if (validConnectedDevices.length > 0) {
      this.globalState.setConnectedDevices(validConnectedDevices);
    }

    // Determine what to do based on results
    if (failedCount > 0 && validConnectedDevices.length > 0) {
      // Some failed, some succeeded - show modal and let user decide
      this.showConnectionResultsModal(validConnectedDevices, results.failed, totalSelected);
    } else if (failedCount > 0 && validConnectedDevices.length === 0) {
      // All failed - show error modal only
      this.showConnectionResultsModal([], results.failed, totalSelected);
    } else if (validConnectedDevices.length > 0) {
      // All succeeded - navigate directly to calibration
      this.proceedToCalibration(validConnectedDevices, totalSelected);
    } else {
      console.log('No devices connected successfully, staying on kraken list page');
    }
  }

  /**
   * Show connection results modal with option to continue or stay
   */
  showConnectionResultsModal(successfulDevices, failedDevices, totalSelected) {
    const failedDevicesFormatted = failedDevices.map(device => ({
      id: device.id,
      name: device.name || 'Unknown',
      error: device.error,
    }));

    this.sendToRenderer('show-connection-errors', {
      successful: successfulDevices.length,
      failed: failedDevicesFormatted,
      totalSelected: totalSelected,
      canProceed: successfulDevices.length > 0, // Tell UI if user can continue to calibration
    });
  }

  /**
   * Proceed to calibration with successfully connected devices
   */
  proceedToCalibration(validConnectedDevices, totalSelected) {
    const connectedDeviceIds = validConnectedDevices.map(device => device.id);

    console.log(
      `Proceeding to calibration with ${connectedDeviceIds.length} validated devices:`,
      connectedDeviceIds
    );

    this.sendToRenderer('navigate-to-calibration', {
      connectedDeviceIds,
      totalSelected: totalSelected,
      successfulCount: validConnectedDevices.length,
    });

    // Enable connect button cooldown (2 seconds like old app)
    this.sendToRenderer('enable-connect-cooldown', { cooldownMs: 2000 });
  }

  formatDeviceForRenderer(device) {
    const signalInfo = getSignalStrengthInfo(device.rssi);

    return {
      id: device.id,
      name: device.name,
      displayName: device.displayName || device.name,
      rssi: device.rssi,
      address: device.address,
      firmwareVersion: device.firmwareVersion || 'Unknown',
      connectionState: device.connectionState || 'disconnected',
      minPressure: device.minPressure,
      maxPressure: device.maxPressure,
      connectedAt: device.connectedAt,
      signalStrength: signalInfo.strength,
      signalBarWidth: signalInfo.barWidth,
      signalColorClass: signalInfo.colorClass,
      isSelected: this.selectedDeviceIds.has(device.id),
    };
  }

  sendToRenderer(channel, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // Public API methods for IPC handlers
  async startScanning() {
    try {
      if (!this.scanner.isBluetoothReady()) {
        throw new Error('Bluetooth is not ready');
      }

      await this.scanner.startScanning();
      return { success: true };
    } catch (error) {
      console.error('Error starting scan:', error);
      return { success: false, error: error.message };
    }
  }

  async stopScanning() {
    try {
      await this.scanner.stopScanning();
      return { success: true };
    } catch (error) {
      console.error('Error stopping scan:', error);
      return { success: false, error: error.message };
    }
  }

  async refreshScan() {
    try {
      this.selectedDeviceIds.clear();
      await this.scanner.refreshScan();
      this.sendToRenderer('scan-refreshed');
      return { success: true };
    } catch (error) {
      console.error('Error refreshing scan:', error);
      return { success: false, error: error.message };
    }
  }

  async connectToSelectedDevices(deviceIds) {
    try {
      if (!deviceIds || deviceIds.length === 0) {
        throw new Error('No devices selected');
      }

      this.sendToRenderer('show-loader');

      // Create device info map
      const deviceInfoMap = new Map();
      for (const deviceId of deviceIds) {
        const deviceInfo = this.scanner.getDevice(deviceId);
        if (deviceInfo) {
          deviceInfoMap.set(deviceId, deviceInfo);
        }
      }

      const results = await this.connection.connectToMultipleDevices(deviceIds, deviceInfoMap);

      // Return serializable data only (no Noble objects)
      return {
        success: true,
        connectedCount: results.successful?.length || 0,
        failedCount: results.failed?.length || 0,
      };
    } catch (error) {
      this.sendToRenderer('hide-loader');
      console.error('Error connecting to devices:', error);
      return { success: false, error: error.message };
    }
  }

  setSelectedDevices(deviceIds) {
    this.selectedDeviceIds = new Set(deviceIds);
  }

  getDiscoveredDevices() {
    return this.scanner.getDiscoveredDevices().map(this.formatDeviceForRenderer.bind(this));
  }

  getConnectedDevices() {
    return this.connection.getConnectedDevices().map(this.formatDeviceForRenderer.bind(this));
  }

  getScanStatus() {
    return this.scanner.getScanStatus();
  }

  getConnectionStatus() {
    return this.connection.getConnectionStatus();
  }

  async cleanup() {
    await this.scanner.cleanup();
    await this.connection.cleanup();
    this.selectedDeviceIds.clear();
  }

  // Initialize the controller when the window loads
  async initialize() {
    try {
      // Load the kraken list page
      await this.loadKrakenListPage();

      // Start scanning if bluetooth is ready
      if (this.scanner.isBluetoothReady()) {
        await this.startScanning();
      }

      return { success: true };
    } catch (error) {
      console.error('Error initializing kraken list:', error);
      return { success: false, error: error.message };
    }
  }

  async loadKrakenListPage() {
    // This will be called when switching to kraken list view
    // Implementation depends on how you want to handle page routing
  }
}

export { KrakenListController };
