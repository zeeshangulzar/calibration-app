import EventEmitter from 'events';

/**
 * Global state manager for Kraken Calibration
 * Maintains state across page navigation and handles proper cleanup
 */
class KrakenCalibrationStateService extends EventEmitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.connectedDevices = new Map();
    this.deviceSetupStatus = new Map();
    this.deviceRetryCount = new Map(); // Track retry attempts per device
    this.activeSubscriptions = new Map(); // Track active characteristic subscriptions
    this.deviceCharacteristics = new Map(); // Track device characteristics for cleanup
    this.deviceSweepData = new Map(); // Track device sweep data
    this.devicePressureData = new Map(); // Track device pressure readings
    this.isCalibrationActive = false;
    this.isVerificationActive = false;
    this.setupQueue = [];
    this.currentSetupIndex = 0;
    this.isSetupInProgress = false;
    this.mainWindow = null;
    this.controller = null;
    this.scanner = null;
    this.connection = null;
    // Retry settings (like old app)
    this.maxRetries = 3;
    this.baseDelay = 2000;

    // Kraken sweep selection
    this.sweepMaxValue = null;
  }

  // Set the current connected devices
  setConnectedDevices(devices) {
    this.connectedDevices.clear();
    this.deviceSetupStatus.clear();
    this.deviceRetryCount.clear();
    this.activeSubscriptions.clear();
    this.deviceCharacteristics.clear();
    this.deviceSweepData.clear();
    this.devicePressureData.clear();

    devices.forEach(device => {
      this.connectedDevices.set(device.id, device);
      this.deviceRetryCount.set(device.id, 0); // Initialize retry count
      this.deviceSetupStatus.set(device.id, {
        status: 'pending', // pending, in-progress, ready, failed, disconnected
        stage: 'waiting', // waiting, discovering, subscribing, complete
        error: null,
        services: null,
        characteristics: null,
        peripheral: device.peripheral,
      });
    });

    this.setupQueue = devices.map(d => d.id);
    this.currentSetupIndex = 0;
    // this.isCalibrationActive = true;

    console.log(`Global state: Set ${devices.length} connected devices`);
  }

  // Update device status
  updateDeviceStatus(deviceId, status, stage = null, error = null, services = null, characteristics = null) {
    const currentStatus = this.deviceSetupStatus.get(deviceId);
    if (!currentStatus) return;

    const updatedStatus = {
      ...currentStatus,
      status,
      stage: stage || currentStatus.stage,
      error: error || currentStatus.error,
      services: services || currentStatus.services,
      characteristics: characteristics || currentStatus.characteristics,
      updatedAt: Date.now(),
    };

    this.deviceSetupStatus.set(deviceId, updatedStatus);

    // Emit status update with serializable data only
    this.emit('deviceStatusUpdate', {
      deviceId,
      status: {
        status: updatedStatus.status,
        stage: updatedStatus.stage,
        error: updatedStatus.error,
        updatedAt: updatedStatus.updatedAt,
      },
    });

    console.log(`Global state: Device ${deviceId} status updated to ${status}${stage ? ` (${stage})` : ''}`);
  }

  // Get connected devices
  getConnectedDevices() {
    return Array.from(this.connectedDevices.values());
  }

  // Get device status
  getDeviceStatus(deviceId) {
    return this.deviceSetupStatus.get(deviceId);
  }

  // Get all device statuses
  getAllDeviceStatuses() {
    return Array.from(this.deviceSetupStatus.entries());
  }

  // Check if all devices are ready
  areAllDevicesReady() {
    const statuses = Array.from(this.deviceSetupStatus.values());
    return statuses.length > 0 && statuses.every(status => status.status === 'ready');
  }

  // Get setup progress
  getSetupProgress() {
    const total = this.deviceSetupStatus.size;
    if (total === 0) return { total: 0, ready: 0, failed: 0, pending: 0, progress: 0 };

    let ready = 0;
    let failed = 0;
    let pending = 0;

    for (const status of this.deviceSetupStatus.values()) {
      switch (status.status) {
        case 'ready':
          ready++;
          break;
        case 'failed':
          failed++;
          break;
        default:
          pending++;
      }
    }

    const progress = Math.round((ready / total) * 100);

    return { total, ready, failed, pending, progress };
  }

  // Set main window reference
  setMainWindow(window) {
    this.mainWindow = window;
  }

  // Set controller reference
  setController(controller) {
    this.controller = controller;
  }

  // Clean up all connections and reset state

  // Disconnect a single device
  async disconnectDevice(peripheral) {
    return new Promise(resolve => {
      try {
        if (peripheral && (peripheral.state === 'connected' || peripheral.state === 'connecting')) {
          peripheral.disconnect(error => {
            if (error) {
              console.warn('Error disconnecting device:', error.message);
            }
            resolve();
          });
        } else {
          resolve();
        }
      } catch (error) {
        console.warn('Error in disconnect:', error.message);
        resolve();
      }
    });
  }

  // Get current state summary
  getStateSummary() {
    return {
      isCalibrationActive: this.isCalibrationActive,
      connectedDeviceCount: this.connectedDevices.size,
      setupProgress: this.getSetupProgress(),
      isSetupInProgress: this.isSetupInProgress,
      areAllReady: this.areAllDevicesReady(),
    };
  }

  // Set service references
  setServices(scanner, connection) {
    this.scanner = scanner;
    this.connection = connection;
  }

  // Get retry count for a device
  getRetryCount(deviceId) {
    return this.deviceRetryCount.get(deviceId) || 0;
  }

  // Increment retry count for a device
  incrementRetryCount(deviceId) {
    const current = this.getRetryCount(deviceId);
    this.deviceRetryCount.set(deviceId, current + 1);
    return current + 1;
  }

  // Check if device can be retried
  canRetryDevice(deviceId) {
    return this.getRetryCount(deviceId) < this.maxRetries;
  }

  // Reset retry count for a device
  resetRetryCount(deviceId) {
    this.deviceRetryCount.set(deviceId, 0);
  }

  // Get fresh peripheral for device (for reconnection)
  async getFreshPeripheral(deviceId) {
    if (!this.scanner) {
      throw new Error('Scanner not available for reconnection');
    }

    const freshDevice = this.scanner.getDevice(deviceId);
    if (!freshDevice || !freshDevice.peripheral) {
      throw new Error(`Fresh peripheral not found for device ${deviceId}`);
    }

    return freshDevice.peripheral;
  }

  // Reconnect to a device with retry logic (like old app)
  async reconnectDevice(deviceId) {
    console.log(`Global state: Attempting to reconnect device ${deviceId}`);

    const device = this.connectedDevices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found in connected devices`);
    }

    const retryCount = this.getRetryCount(deviceId);
    const maxRetries = this.maxRetries;

    if (retryCount >= maxRetries) {
      throw new Error(`Max retries (${maxRetries}) exceeded for device ${deviceId}`);
    }

    const attempt = retryCount + 1;
    console.log(`Global state: Reconnection attempt ${attempt}/${maxRetries} for device ${deviceId}`);

    try {
      // Disconnect old peripheral if connected
      if (device.peripheral && (device.peripheral.state === 'connected' || device.peripheral.state === 'connecting')) {
        await this.disconnectDevice(device.peripheral);
        await this.addDelay(1500); // Wait for clean disconnect
      }

      // Get fresh peripheral from scanner
      const freshPeripheral = await this.getFreshPeripheral(deviceId);

      // Update device with fresh peripheral
      device.peripheral = freshPeripheral;
      this.connectedDevices.set(deviceId, device);

      // Update status with fresh peripheral
      const status = this.deviceSetupStatus.get(deviceId);
      if (status) {
        status.peripheral = freshPeripheral;
        this.deviceSetupStatus.set(deviceId, status);
      }

      // Use connection service to reconnect
      if (!this.connection) {
        throw new Error('Connection service not available for reconnection');
      }

      const deviceInfo = this.scanner.getDevice(deviceId);
      const reconnectedDevice = await this.connection.connectToDevice(deviceInfo);

      // Update connected device with new connection data
      this.connectedDevices.set(deviceId, reconnectedDevice);

      console.log(`Global state: Successfully reconnected device ${deviceId}`);
      return reconnectedDevice;
    } catch (error) {
      this.incrementRetryCount(deviceId);
      const delay = this.baseDelay * Math.pow(2, attempt - 1); // Exponential backoff

      console.log(`Global state: Reconnection attempt ${attempt} failed for device ${deviceId}: ${error.message}`);

      if (this.canRetryDevice(deviceId)) {
        console.log(`Global state: Will retry device ${deviceId} after ${delay}ms delay`);
        await this.addDelay(delay);
        return this.reconnectDevice(deviceId); // Recursive retry
      } else {
        throw new Error(`Failed to reconnect device ${deviceId} after ${maxRetries} attempts: ${error.message}`);
      }
    }
  }

  // Track active subscription for a device
  addActiveSubscription(deviceId, characteristic, handler) {
    this.activeSubscriptions.set(deviceId, { characteristic, handler });
    console.log(`Global state: Added subscription for device ${deviceId}`);
  }

  // Track device characteristics for cleanup
  setDeviceCharacteristics(deviceId, characteristics) {
    this.deviceCharacteristics.set(deviceId, characteristics);
  }

  // Cleanup subscription for a device (like old app)
  async cleanupDeviceSubscription(deviceId) {
    const subscription = this.activeSubscriptions.get(deviceId);
    if (subscription) {
      const { characteristic, handler } = subscription;
      try {
        // Unsubscribe from characteristic
        await new Promise(resolve => {
          characteristic.unsubscribe(err => {
            if (err) {
              console.warn(`Error unsubscribing from device ${deviceId}:`, err.message);
            } else {
              console.log(`Unsubscribed from device ${deviceId}`);
            }
            resolve();
          });
        });

        // Remove data listener
        characteristic.removeListener('data', handler);

        // Remove from tracking
        this.activeSubscriptions.delete(deviceId);

        console.log(`Global state: Cleaned up subscription for device ${deviceId}`);
      } catch (error) {
        console.warn(`Error during subscription cleanup for device ${deviceId}:`, error.message);
      }
    }
  }

  // Enhanced cleanup (exactly like old app)
  async cleanup() {
    console.log('Global state: Starting enhanced cleanup...');

    try {
      // Step 1: Cleanup all subscriptions (like old app)
      console.log('Global state: Cleaning up subscriptions...');
      const subscriptionCleanupPromises = [];
      for (const deviceId of this.activeSubscriptions.keys()) {
        subscriptionCleanupPromises.push(this.cleanupDeviceSubscription(deviceId));
      }

      if (subscriptionCleanupPromises.length > 0) {
        await Promise.allSettled(subscriptionCleanupPromises);
        console.log('Global state: All subscriptions cleaned up');
      }

      // Step 2: Disconnect all devices with delays (like old app)
      console.log('Global state: Disconnecting devices...');
      for (const [deviceId, device] of this.connectedDevices.entries()) {
        if (device.peripheral) {
          await this.disconnectDeviceWithDelay(device.peripheral, deviceId);
          // Individual delay between each device disconnect (like old app)
          await this.addDelay(500);
        }
      }

      // Step 3: Allow Windows BLE stack to fully release (like old app)
      console.log('Global state: Allowing BLE stack to release...');
      await this.addDelay(1000);

      // Step 4: Reset connection service state to ensure clean slate
      if (this.connection) {
        console.log('Global state: Resetting connection service state...');
        this.connection.resetState();
        await this.addDelay(500);
      }

      // Step 5: Restart scanning (like old app)
      if (this.scanner) {
        console.log('Global state: Restarting scanning...');
        try {
          await this.scanner.stopScanning();
          await this.addDelay(500);
          await this.scanner.startScanning();
          console.log('Global state: Scanning restarted');
        } catch (scanError) {
          console.warn('Global state: Error restarting scanning:', scanError.message);
        }
      }

      // Step 6: Reset all state
      this.reset();

      console.log('Global state: Enhanced cleanup completed');

      // Emit cleanup complete event
      this.emit('cleanupComplete');
    } catch (error) {
      console.error('Global state: Error during enhanced cleanup:', error);
      throw error; // Re-throw to handle in calling code
    }
  }

  async disconnectDeviceWithDelay(peripheral, deviceId) {
    // Early return if peripheral is invalid or already disconnected
    if (!this.isPeripheralDisconnectable(peripheral)) {
      console.log(`Device ${deviceId}: No disconnection needed (peripheral not connected)`);
      return;
    }

    try {
      await this.performDisconnect(peripheral);
      console.log(`Device ${deviceId}: Successfully disconnected`);
    } catch (error) {
      console.warn(`Device ${deviceId}: Disconnect failed - ${error.message}`);
      // Don't throw - we want cleanup to continue even if disconnect fails
    }
  }

  isPeripheralDisconnectable(peripheral) {
    return peripheral && peripheral.state && (peripheral.state === 'connected' || peripheral.state === 'connecting');
  }

  performDisconnect(peripheral) {
    return new Promise((resolve, reject) => {
      peripheral.disconnect(error => {
        if (error) {
          reject(new Error(`Peripheral disconnect failed: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async addDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearKrakenSweepData() {
    this.deviceSweepData.clear();
  }

  async unSubscribeAllkrakens() {
    const subscriptionCleanupPromises = [];
    for (const deviceId of this.activeSubscriptions.keys()) {
      subscriptionCleanupPromises.push(this.cleanupDeviceSubscription(deviceId));
    }

    if (subscriptionCleanupPromises.length > 0) {
      const results = await Promise.allSettled(subscriptionCleanupPromises);

      // Log any failures but continue
      results.forEach(result => {
        if (result.status === 'rejected') {
          console.error('Global state: Failed to cleanup subscription:', result.reason);
        }
      });

      console.log('Global state: All subscriptions cleaned up');
    }
  }

  setDeviceCalibrated(deviceId, value = true) {
    const device = this.connectedDevices.get(deviceId);
    if (device) {
      device.isCalibrated = value;
      this.connectedDevices.set(deviceId, device);
    }
  }

  isDeviceCalibrated(deviceId) {
    const device = this.connectedDevices.get(deviceId);
    return device ? !!device.isCalibrated : false;
  }

  // Pressure data management methods
  setDevicePressure(deviceId, pressure) {
    this.devicePressureData.set(deviceId, {
      value: pressure,
      timestamp: Date.now(),
    });
  }

  getDevicePressure(deviceId) {
    const pressureData = this.devicePressureData.get(deviceId);
    return pressureData ? pressureData.value : null;
  }

  clearDevicePressures() {
    this.devicePressureData.clear();
  }

  // Sweep data management methods
  addKrakenSweepData(deviceId, dataPoint) {
    if (!this.deviceSweepData.has(deviceId)) {
      this.deviceSweepData.set(deviceId, []);
    }
    this.deviceSweepData.get(deviceId).push(dataPoint);
  }

  getKrakenSweepData() {
    const sweepData = {};
    for (const [deviceId, dataPoints] of this.deviceSweepData.entries()) {
      sweepData[deviceId] = dataPoints;
    }
    return sweepData;
  }
}

// Singleton instance
let stateInstance = null;

export function getKrakenCalibrationState() {
  if (!stateInstance) {
    stateInstance = new KrakenCalibrationStateService();
  }
  return stateInstance;
}

export { KrakenCalibrationStateService };
