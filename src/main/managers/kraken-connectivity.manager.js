import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Kraken Connectivity Manager
 * Handles Kraken device connectivity monitoring, reconnection, and disconnection
 */
export class KrakenConnectivityManager {
  constructor(globalState, connection, scanner, sendToRenderer, deviceSetupManager = null) {
    this.globalState = globalState;
    this.connection = connection;
    this.scanner = scanner;
    this.sendToRenderer = sendToRenderer;
    this.deviceSetupManager = deviceSetupManager;
    this.connectivityMonitor = null;
    this.monitoringInterval = KRAKEN_CONSTANTS.CONNECTIVITY_MONITOR_INTERVAL; // Check every 2 seconds
  }

  /**
   * Start continuous connectivity monitoring for all connected krakens
   */
  startConnectivityMonitoring() {
    if (this.connectivityMonitor) {
      clearInterval(this.connectivityMonitor);
    }

    console.log('Starting kraken connectivity monitoring...');
    this.connectivityMonitor = setInterval(() => {
      this.checkDeviceConnectivity();
    }, this.monitoringInterval);
  }

  /**
   * Stop connectivity monitoring
   */
  stopConnectivityMonitoring() {
    if (this.connectivityMonitor) {
      clearInterval(this.connectivityMonitor);
      this.connectivityMonitor = null;
      console.log('Stopped kraken connectivity monitoring');
    }
  }

  /**
   * Check connectivity status of all devices
   */
  checkDeviceConnectivity() {
    const devices = this.globalState.getConnectedDevices();

    for (const device of devices) {
      const isConnected = device.peripheral && device.peripheral.state === 'connected';
      const currentStatus = this.globalState.getDeviceStatus(device.id);

      if (!isConnected && currentStatus?.status !== 'disconnected') {
        // Device has disconnected
        console.log(`Device ${device.id} has disconnected`);
        this.handleDeviceConnectivityLoss(device.id);
      }
    }

    // Update calibration button state based on connectivity
    this.updateCalibrationButtonState();
  }

  /**
   * Handle when a device loses connectivity
   * @param {string} deviceId - Device that lost connectivity
   */
  handleDeviceConnectivityLoss(deviceId) {
    // Update device status to disconnected
    this.globalState.updateDeviceStatus(deviceId, 'disconnected', 'offline', 'Device disconnected');

    // Cleanup any active subscriptions for this device
    this.globalState.cleanupDeviceSubscription(deviceId);

    // Send disconnection event to renderer
    this.sendToRenderer('device-connectivity-lost', {
      deviceId,
      message: 'Device has disconnected. Please reconnect to continue.',
    });

    this.updateProgressSummary();
  }

  /**
   * Handle device disconnection event
   * @param {string} deviceId - Disconnected device ID
   */
  handleDeviceDisconnection(deviceId) {
    if (this.globalState.connectedDevices.has(deviceId)) {
      this.globalState.connectedDevices.delete(deviceId);
      this.globalState.deviceSetupStatus.delete(deviceId);
      this.sendToRenderer('device-disconnected', { deviceId });
      this.updateProgressSummary();
    }
  }

  /**
   * Reconnect a specific disconnected device
   * @param {string} deviceId - Device ID to reconnect
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async reconnectDisconnectedDevice(deviceId) {
    try {
      console.log(`Attempting to reconnect device ${deviceId}...`);

      // Update status to show reconnection attempt
      this.globalState.updateDeviceStatus(deviceId, 'in-progress', 'reconnecting', null);
      this.sendToRenderer('device-reconnection-started', { deviceId });

      // Get fresh peripheral and check connection state
      const freshPeripheral = await this.globalState.getFreshPeripheral(deviceId);

      // Check if peripheral is already connected
      if (freshPeripheral.state === 'connected') {
        console.log(`Device ${deviceId} is already connected, skipping connection step`);
      } else {
        console.log(`Connecting to device ${deviceId}...`);
        // Connect with timeout only if not already connected
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Reconnection timeout - device may be out of range or powered off'));
          }, KRAKEN_CONSTANTS.CONNECTION_TIMEOUT);

          freshPeripheral.connect(error => {
            clearTimeout(timeout);
            if (error) {
              // Check if error is about already being connected
              if (error.message.includes('already connected') || error.message.includes('Peripheral already connected')) {
                console.log(`Device ${deviceId} was already connected, continuing with setup`);
                resolve();
              } else {
                reject(new Error(`Connection failed: ${error.message}`));
              }
            } else {
              console.log(`Device ${deviceId} reconnected successfully`);
              resolve();
            }
          });
        });
      }

      // Update device with connected peripheral
      const device = this.globalState.connectedDevices.get(deviceId);
      if (device) {
        device.peripheral = freshPeripheral;
        this.globalState.connectedDevices.set(deviceId, device);
      }

      // Re-setup ONLY this device (don't trigger full sequential setup)
      console.log(`Setting up device ${deviceId} after reconnection...`);
      const success = await this.setupDevice(deviceId);

      if (success) {
        console.log(`Device ${deviceId} successfully reconnected and set up`);
        this.sendToRenderer('device-reconnection-success', { deviceId });

        // Check if all devices are ready after this reconnection
        this.checkAllDevicesReady();

        return { success: true };
      } else {
        throw new Error('Failed to setup device after reconnection');
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'kraken-connectivity', method: 'reconnectDevice' },
        extra: { deviceId },
      });
      console.error(`Failed to reconnect device ${deviceId}:`, error);
      this.globalState.updateDeviceStatus(deviceId, 'disconnected', 'offline', error.message);
      this.sendToRenderer('device-reconnection-failed', {
        deviceId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Manually disconnect a device and remove it from the connected list
   * @param {string} deviceId - Device ID to disconnect
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async manuallyDisconnectDevice(deviceId) {
    // Wrap entire operation in a timeout to prevent hanging
    return Promise.race([
      this.performManualDisconnect(deviceId),
      new Promise(resolve => {
        setTimeout(() => {
          console.warn(`Manual disconnect timeout for device ${deviceId}, forcing removal`);
          resolve(this.forceRemoveDevice(deviceId));
        }, 10000); // 10 second timeout for entire operation
      }),
    ]);
  }

  /**
   * Perform the actual manual disconnect operation
   * @param {string} deviceId - Device ID to disconnect
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async performManualDisconnect(deviceId) {
    try {
      console.log(`Manually disconnecting device ${deviceId}...`);

      // Pause setup process if it's running
      if (this.globalState.isSetupInProgress && this.deviceSetupManager) {
        this.deviceSetupManager.pauseSetup(`Removing device ${deviceId}`);
      }

      const device = this.globalState.connectedDevices.get(deviceId);
      if (!device) {
        // Resume setup if device not found
        if (this.globalState.isSetupInProgress && this.deviceSetupManager) {
          this.deviceSetupManager.resumeSetup();
        }
        return { success: false, error: 'Device not found' };
      }

      // Update status to show disconnection in progress
      this.globalState.updateDeviceStatus(deviceId, 'in-progress', 'disconnecting', null);
      this.sendToRenderer('device-manual-disconnect-started', { deviceId });

      // Fast path for already disconnected and non-discoverable devices
      const isPeripheralConnected = device.peripheral && device.peripheral.state === 'connected';
      let isDeviceDiscoverable = false;

      try {
        const discoveredDevice = this.scanner.getDevice(deviceId);
        isDeviceDiscoverable = discoveredDevice !== null && discoveredDevice !== undefined;
      } catch {
        isDeviceDiscoverable = false;
      }

      console.log(`Device ${deviceId} - Connected: ${isPeripheralConnected}, Discoverable: ${isDeviceDiscoverable}`);

      // Fast removal for disconnected and non-discoverable devices
      if (!isPeripheralConnected && !isDeviceDiscoverable) {
        console.log(`Device ${deviceId} is already disconnected and not discoverable - fast removal`);

        // Quick cleanup of any remaining subscriptions
        this.globalState.activeSubscriptions.delete(deviceId);

        // Skip all disconnect attempts and proceed directly to removal
        return this.completeDeviceRemoval(deviceId, 'Device was already disconnected and turned off');
      }

      // Cleanup subscriptions for connected/discoverable devices
      if (isPeripheralConnected || isDeviceDiscoverable) {
        await this.globalState.cleanupDeviceSubscription(deviceId);
      }

      // Attempt to disconnect only if peripheral is actually connected
      if (isPeripheralConnected && isDeviceDiscoverable) {
        try {
          await new Promise(resolve => {
            const timeout = setTimeout(() => {
              console.warn(`Disconnect timeout for device ${deviceId}, proceeding with removal`);
              resolve();
            }, KRAKEN_CONSTANTS.MANUAL_DISCONNECT_TIMEOUT); // Reduced timeout for faster removal

            device.peripheral.disconnect(disconnectError => {
              clearTimeout(timeout);
              if (disconnectError) {
                console.warn(`Error disconnecting device ${deviceId}:`, disconnectError.message);
              }
              resolve();
            });
          });
        } catch (disconnectError) {
          Sentry.captureException(disconnectError, {
            tags: { service: 'kraken-connectivity', method: 'disconnectDeviceBeforeRemoval' },
            extra: { deviceId },
          });
          console.warn(`Failed to disconnect device ${deviceId}:`, disconnectError.message);
          // Continue with removal even if disconnect fails
        }
      } else {
        console.log(`Device ${deviceId} peripheral not connected or not discoverable, skipping disconnect attempt`);
      }

      // Complete the removal process
      return this.completeDeviceRemoval(deviceId, isDeviceDiscoverable ? 'Device manually disconnected and removed' : 'Device removed from list (device was turned off)');
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'kraken-connectivity', method: 'manuallyDisconnectDevice' },
        extra: { deviceId },
      });
      console.error(`Error manually disconnecting device ${deviceId}:`, error);

      // Resume setup if it was paused and removal failed
      if (this.globalState.isSetupInProgress && this.deviceSetupManager) {
        this.deviceSetupManager.resumeSetup();
      }

      this.sendToRenderer('device-manual-disconnect-failed', {
        deviceId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Complete the device removal process (shared by all removal paths)
   * @param {string} deviceId - Device ID to remove
   * @param {string} statusMessage - Message to log
   * @returns {Promise<{success: boolean}>}
   */
  async completeDeviceRemoval(deviceId, statusMessage) {
    try {
      console.log(`Removing device ${deviceId} from all tracking...`);

      // Remove from all tracking immediately
      this.globalState.connectedDevices.delete(deviceId);
      this.globalState.deviceSetupStatus.delete(deviceId);
      this.globalState.deviceRetryCount.delete(deviceId);
      this.globalState.deviceCharacteristics.delete(deviceId);
      this.globalState.activeSubscriptions.delete(deviceId);

      // Update setup queue
      const queueIndex = this.globalState.setupQueue.indexOf(deviceId);
      if (queueIndex > -1) {
        this.globalState.setupQueue.splice(queueIndex, 1);
        console.log(`Removed device ${deviceId} from setup queue at index ${queueIndex}`);

        // Adjust currentSetupIndex if the removed device was at or before the current index
        if (queueIndex <= this.globalState.currentSetupIndex) {
          this.globalState.currentSetupIndex = Math.max(0, this.globalState.currentSetupIndex - 1);
          console.log(`Adjusted currentSetupIndex to ${this.globalState.currentSetupIndex} after removing device at index ${queueIndex}`);
        }
      }

      // Send success event to renderer immediately
      this.sendToRenderer('device-manual-disconnect-success', { deviceId });
      this.updateProgressSummary();
      this.updateCalibrationButtonState();

      // Resume setup process if setup was paused for this removal
      if (this.globalState.isSetupInProgress && this.deviceSetupManager) {
        console.log('Setup in progress, resuming after device removal...');
        // Use setTimeout to allow the current operation to complete before resuming
        setTimeout(() => {
          try {
            this.deviceSetupManager.resumeSetup();
          } catch (error) {
            console.error('Error resuming setup after device removal:', error);
          }
        }, 100);
      }

      console.log(`Device ${deviceId}: ${statusMessage}`);
      return { success: true };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'kraken-connectivity', method: 'completeDeviceRemoval' },
        extra: { deviceId },
      });
      console.error(`Error completing removal for device ${deviceId}:`, error);
      return { success: true }; // Return success anyway to clear UI
    }
  }

  /**
   * Force remove a device without attempting to disconnect (used as timeout fallback)
   * @param {string} deviceId - Device ID to remove
   * @returns {Promise<{success: boolean}>}
   */
  async forceRemoveDevice(deviceId) {
    console.log(`Force removing device ${deviceId} (timeout/fallback)...`);
    return this.completeDeviceRemoval(deviceId, 'Force removed due to timeout');
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
        return status?.status === 'ready' && device.peripheral && device.peripheral.state === 'connected';
      });

    // Disable button if calibration is in progress
    const enabled = allDevicesReady && !this.globalState.isCalibrationActive;

    this.sendToRenderer('update-calibration-button-state', {
      enabled: enabled,
      deviceCount: devices.length,
    });
  }

  /**
   * Update overall progress summary and send to renderer
   */
  updateProgressSummary() {
    const progressData = this.globalState.getSetupProgress();
    this.sendToRenderer('progress-update', progressData);
  }

  /**
   * Check if all devices are ready and enable calibration
   */
  checkAllDevicesReady() {
    if (this.globalState.areAllDevicesReady()) {
      this.sendToRenderer('all-devices-ready');
    }
  }
}
