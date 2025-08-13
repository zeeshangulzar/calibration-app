import EventEmitter from 'events';
import { KRAKEN_CONSTANTS } from '../constants/kraken.constants.js';
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
        await this.delay(1000); // Allow Windows BLE stack to fully release
      }

      // Connect to the peripheral
      await this.connectWithTimeout(peripheral, KRAKEN_CONSTANTS.CONNECTION_TIMEOUT);
      
      // Discover services and characteristics
      const { services, characteristics } = await discoverWithTimeout(peripheral, KRAKEN_CONSTANTS.DISCOVERY_TIMEOUT);
      
      // Get device information
      const deviceDetails = await this.gatherDeviceDetails(services, characteristics, deviceInfo);
      
      // Create connected device object (without Noble objects to avoid cloning issues)
      const connectedDevice = {
        id: deviceInfo.id,
        name: deviceInfo.name,
        address: deviceInfo.address,
        rssi: deviceInfo.rssi,
        ...deviceDetails,
        connectionState: KRAKEN_CONSTANTS.CONNECTION_STATES.CONNECTED,
        connectedAt: new Date().toISOString(),
        // Store peripheral reference separately for internal use
        peripheral: peripheral
      };

      this.connectedDevices.set(id, connectedDevice);
      this.connectionAttempts.delete(id);
      

      this.emit('deviceConnected', connectedDevice);
      
      return connectedDevice;
      
    } catch (error) {
      this.connectionAttempts.delete(id);
      console.error(`Failed to connect to device ${id}:`, error);
      this.emit('connectionFailed', { deviceId: id, error: error.message });
      throw error;
    }
  }

  async connectToMultipleDevices(deviceIds, deviceInfoMap) {
    const results = {
      successful: [],
      failed: []
    };


    
    // Connect to devices in parallel
    const connectionPromises = deviceIds.map(async (deviceId) => {
      try {
        const deviceInfo = deviceInfoMap.get(deviceId);
        if (!deviceInfo) {
          throw new Error(`Device info not found for ${deviceId}`);
        }
        
        const connectedDevice = await this.connectToDevice(deviceInfo);
        results.successful.push(connectedDevice);
        return { success: true, device: connectedDevice };
      } catch (error) {
        const deviceInfo = deviceInfoMap.get(deviceId) || { id: deviceId, name: 'Unknown' };
        results.failed.push({ ...deviceInfo, error: error.message });
        return { success: false, deviceId, error: error.message };
      }
    });

    await Promise.allSettled(connectionPromises);
    

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
      maxPressure: 100
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
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 5000);

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
      
      peripheral.connect((error) => {
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
        }, 5000);

        peripheral.disconnect((error) => {
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
      connectedDeviceIds: Array.from(this.connectedDevices.keys())
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    await this.disconnectAll();
    this.removeAllListeners();
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