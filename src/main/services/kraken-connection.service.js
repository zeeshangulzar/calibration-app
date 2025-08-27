import EventEmitter from 'events';
import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import { discoverWithTimeout } from '../utils/ble.utils.js';

class KrakenConnectionService extends EventEmitter {
  constructor() {
    super();
    this.connectedDevices = new Map();
    this.connectionAttempts = new Map();
  }

  async connectToDevice(deviceInfo) {
    const { id, peripheral } = deviceInfo;

    try {
      this.emit('connectionStarted', { deviceId: id });

      // Check if already connected or connecting
      if (this.isDeviceConnected(id) || this.isDeviceConnecting(id)) {
        return this.getConnectedDevice(id);
      }

      this.connectionAttempts.set(id, { status: 'connecting', startTime: Date.now() });

      // Disconnect if already connected (cleanup)
      if (peripheral.state === 'connected' || peripheral.state === 'connecting') {
        await this.disconnectPeripheral(peripheral);
        await this.delay(KRAKEN_CONSTANTS.DELAY_BLE_STACK_RELEASE); // Allow Windows BLE stack to fully release
      }

      // Connect to the peripheral
      await this.connectWithTimeout(peripheral, KRAKEN_CONSTANTS.CONNECTION_TIMEOUT);

      // Create connected device object (without Noble objects to avoid cloning issues)
      const connectedDevice = {
        id: deviceInfo.id,
        name: deviceInfo.name,
        address: deviceInfo.address,
        rssi: deviceInfo.rssi,
        connectionState: KRAKEN_CONSTANTS.CONNECTION_STATES.CONNECTED,
        connectedAt: new Date().toISOString(),
        // Store peripheral reference separately for internal use
        peripheral: peripheral,
      };

      this.connectedDevices.set(id, connectedDevice);
      this.connectionAttempts.delete(id);

      this.emit('deviceConnected', connectedDevice);

      return connectedDevice;
    } catch (error) {
      // Use the new error handling method
      await this.handleConnectionError(id, error, peripheral);

      console.error(`Failed to connect to device ${id}:`, error);
      this.emit('connectionFailed', { deviceId: id, error: error.message });
      throw error;
    }
  }

  async connectToMultipleDevices(deviceIds, deviceInfoMap) {
    const results = {
      successful: [],
      failed: [],
    };

    // Connect to devices sequentially with delays to prevent BLE interference
    for (let i = 0; i < deviceIds.length; i++) {
      const deviceId = deviceIds[i];

      const deviceInfo = deviceInfoMap.get(deviceId);
      if (!deviceInfo) {
        console.error(`Device info not found for ${deviceId}`);
        results.failed.push({
          id: deviceId,
          name: 'Unknown',
          error: 'Device info not found',
        });
        continue;
      }

      console.log(`Connecting to device ${i + 1}/${deviceIds.length}: ${deviceId}`);
      this.emit('deviceConnectionStarted', {
        deviceId,
        currentIndex: i + 1,
        totalCount: deviceIds.length,
        deviceName: deviceInfo.name || 'Unknown',
      });

      // Try connecting with up to MAX_RETRIES_PER_KRAKEN retries
      let connectedDevice = null;
      let lastError = null;

      for (let retry = 0; retry < KRAKEN_CONSTANTS.MAX_RETRIES_PER_KRAKEN; retry++) {
        try {
          if (retry > 0) {
            console.log(
              `Retry ${retry}/${KRAKEN_CONSTANTS.MAX_RETRIES_PER_KRAKEN} for device ${deviceId}`
            );
            this.emit('deviceConnectionRetry', {
              deviceId,
              retryAttempt: retry + 1,
              maxRetries: KRAKEN_CONSTANTS.MAX_RETRIES_PER_KRAKEN,
              deviceName: deviceInfo.name || 'Unknown',
            });
            // Wait a bit longer between retries
            await this.delay(KRAKEN_CONSTANTS.DELAY_BETWEEN_RETRIES);
          }

          connectedDevice = await this.connectToDevice(deviceInfo);
          console.log(`Successfully connected to device: ${deviceId} on attempt ${retry + 1}`);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error;
          console.warn(
            `Connection attempt ${retry + 1}/${KRAKEN_CONSTANTS.MAX_RETRIES_PER_KRAKEN} failed for device ${deviceId}:`,
            error.message
          );

          // Clean up any partial connection state
          if (deviceInfo.peripheral) {
            try {
              await this.disconnectPeripheral(deviceInfo.peripheral);
              await this.delay(500); // Brief delay after cleanup
            } catch (cleanupError) {
              console.warn(`Cleanup error for ${deviceId}:`, cleanupError.message);
            }
          }
        }
      }

      if (connectedDevice) {
        results.successful.push(connectedDevice);
        this.emit('deviceConnectionSuccess', {
          deviceId,
          currentIndex: i + 1,
          totalCount: deviceIds.length,
          connectedCount: results.successful.length,
        });

        // Add delay after successful connection
        if (i < deviceIds.length - 1) {
          console.log(
            `Waiting ${KRAKEN_CONSTANTS.DELAY_BETWEEN_CONNECTIONS}ms before next connection...`
          );
          await this.delay(KRAKEN_CONSTANTS.DELAY_BETWEEN_CONNECTIONS);
        }
      } else {
        // All retries failed
        console.error(
          `Failed to connect to device ${deviceId} after ${KRAKEN_CONSTANTS.MAX_RETRIES_PER_KRAKEN} attempts`
        );
        results.failed.push({
          ...deviceInfo,
          error: lastError
            ? lastError.message
            : `Connection failed after ${KRAKEN_CONSTANTS.MAX_RETRIES_PER_KRAKEN} retries`,
        });

        this.emit('deviceConnectionFailed', {
          deviceId,
          currentIndex: i + 1,
          totalCount: deviceIds.length,
          error: lastError
            ? lastError.message
            : `Connection failed after ${KRAKEN_CONSTANTS.MAX_RETRIES_PER_KRAKEN} retries`,
          deviceName: deviceInfo.name || 'Unknown',
        });

        // Still wait before trying next device
        if (i < deviceIds.length - 1) {
          console.log(
            `Waiting ${KRAKEN_CONSTANTS.DELAY_BETWEEN_CONNECTIONS}ms before next connection attempt...`
          );
          await this.delay(KRAKEN_CONSTANTS.DELAY_BETWEEN_CONNECTIONS);
        }
      }
    }

    this.emit('multipleConnectionsComplete', results);

    return results;
  }

  async disconnectDevice(deviceId) {
    try {
      const connectedDevice = this.connectedDevices.get(deviceId);
      if (!connectedDevice) {
        return;
      }
      await this.disconnectPeripheral(connectedDevice.peripheral);

      this.connectedDevices.delete(deviceId);
      this.emit('deviceDisconnected', { deviceId });
    } catch (error) {
      console.error(`Error disconnecting device ${deviceId}:`, error);
      this.emit('disconnectionError', { deviceId, error: error.message });
    }
  }

  async disconnectAll() {
    const connectedIds = Array.from(this.connectedDevices.keys());

    const disconnectionPromises = connectedIds.map(id => this.disconnectDevice(id));
    await Promise.allSettled(disconnectionPromises);

    this.connectedDevices.clear();
    this.emit('allDevicesDisconnected');
  }

  async gatherDeviceDetails(services, characteristics, deviceInfo) {
    const details = {
      firmwareVersion: 'Unknown',
      displayName: deviceInfo.name,
      minPressure: 0,
      maxPressure: 100,
    };

    try {
      // Get firmware version (like old app)
      const firmwareChar = characteristics.find(
        c => c.uuid === KRAKEN_CONSTANTS.FIRMWARE_REVISION_CHARACTERISTIC_UUID
      );

      if (firmwareChar) {
        const data = await this.safeReadCharacteristic(firmwareChar);
        if (data && data.length > 0) {
          details.firmwareVersion = data.toString('utf8').trim();
        }
      }

      // Get display name
      const nameChar = characteristics.find(
        c => c.uuid === KRAKEN_CONSTANTS.DISPLAY_NAME_CHARACTERISTIC_UUID
      );

      if (nameChar) {
        const data = await this.safeReadCharacteristic(nameChar);
        if (data && data.length > 0) {
          details.displayName = data.toString('utf8').trim() || deviceInfo.name;
        }
      }

      // Skip pressure characteristics to avoid buffer issues
      // These will be handled during calibration setup if needed
    } catch (error) {
      console.warn('Error gathering device details:', error);
    }

    return details;
  }

  async safeReadCharacteristic(characteristic) {
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, KRAKEN_CONSTANTS.CHARACTERISTIC_READ_TIMEOUT);

      characteristic.read((error, data) => {
        clearTimeout(timeout);
        if (error) {
          console.warn('Characteristic read failed:', error.message);
          resolve(null);
        } else {
          resolve(data);
        }
      });
    });
  }

  async connectWithTimeout(peripheral, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, timeout);

      const onConnect = () => {
        clearTimeout(timeoutId);
        peripheral.removeListener('connect', onConnect);
        peripheral.removeListener('disconnect', onDisconnect);
        resolve();
      };

      const onDisconnect = () => {
        clearTimeout(timeoutId);
        peripheral.removeListener('connect', onConnect);
        peripheral.removeListener('disconnect', onDisconnect);
        reject(new Error('Connection failed - device disconnected'));
      };

      peripheral.once('connect', onConnect);
      peripheral.once('disconnect', onDisconnect);

      peripheral.connect(error => {
        if (error) {
          clearTimeout(timeoutId);
          peripheral.removeListener('connect', onConnect);
          peripheral.removeListener('disconnect', onDisconnect);
          reject(new Error(`Connection failed: ${error.message}`));
        }
      });
    });
  }

  async disconnectPeripheral(peripheral) {
    if (peripheral.state === 'connected' || peripheral.state === 'connecting') {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Disconnect timeout'));
        }, KRAKEN_CONSTANTS.DISCONNECT_TIMEOUT);

        peripheral.disconnect(error => {
          clearTimeout(timeout);
          if (error) {
            reject(new Error(`Disconnect failed: ${error.message}`));
          } else {
            resolve();
          }
        });
      });
    }
  }

  isDeviceConnected(deviceId) {
    return this.connectedDevices.has(deviceId);
  }

  isDeviceConnecting(deviceId) {
    return this.connectionAttempts.has(deviceId);
  }

  getConnectedDevice(deviceId) {
    return this.connectedDevices.get(deviceId);
  }

  getConnectedDevices() {
    return Array.from(this.connectedDevices.values());
  }

  getConnectionStatus() {
    return {
      connectedCount: this.connectedDevices.size,
      connectingCount: this.connectionAttempts.size,
      connectedDeviceIds: Array.from(this.connectedDevices.keys()),
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    await this.disconnectAll();
    this.removeAllListeners();
    this.resetState();
  }

  /**
   * Reset the connection service state completely
   * This ensures no stale connections remain when reconnecting to the same devices
   */
  resetState() {
    console.log('Connection service: Resetting state...');
    this.connectedDevices.clear();
    this.connectionAttempts.clear();
    console.log('Connection service: State reset complete');
  }

  /**
   * Prepare for reconnection by ensuring clean state
   * This is called when navigating back to the device list to ensure fresh connections
   */
  async prepareForReconnection() {
    console.log('Connection service: Preparing for reconnection...');

    // Disconnect all current connections
    await this.disconnectAll();

    // Reset state
    this.resetState();

    // Allow BLE stack to fully release
    await this.delay(KRAKEN_CONSTANTS.DELAY_BLE_STACK_RELEASE);

    console.log('Connection service: Ready for reconnection');
  }

  /**
   * Handle connection errors more gracefully
   * This method attempts to recover from common connection issues
   */
  async handleConnectionError(deviceId, error, peripheral) {
    console.log(`Connection service: Handling error for device ${deviceId}:`, error.message);

    try {
      // Attempt to disconnect the peripheral if it's in a bad state
      if (peripheral && (peripheral.state === 'connected' || peripheral.state === 'connecting')) {
        await this.disconnectPeripheral(peripheral);
        await this.delay(1000); // Wait for clean disconnect
      }

      // Remove any stale connection attempts
      this.connectionAttempts.delete(deviceId);

      console.log(`Connection service: Error handling completed for device ${deviceId}`);
    } catch (cleanupError) {
      console.warn(
        `Connection service: Error during error handling for device ${deviceId}:`,
        cleanupError.message
      );
    }
  }
}

// Singleton instance
let connectionInstance = null;

export function getKrakenConnection() {
  if (!connectionInstance) {
    connectionInstance = new KrakenConnectionService();
  }
  return connectionInstance;
}

export { KrakenConnectionService };
