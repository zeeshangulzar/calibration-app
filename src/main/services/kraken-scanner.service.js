import EventEmitter from 'events';
import noble from '@abandonware/noble';
import { KRAKEN_CONSTANTS } from '../constants/kraken.constants.js';

class KrakenScannerService extends EventEmitter {
  constructor() {
    super();
    this.discoveredDevices = new Map();
    this.isScanning = false;
    this.scanTimeout = null;
    this.bluetoothState = null;
    
    this.setupNobleEvents();
  }

  setupNobleEvents() {
    noble.on('stateChange', (state) => {
      this.bluetoothState = state;
      this.emit('bluetoothStateChanged', state);
      
      if (state !== 'poweredOn') {
        this.stopScanning();
      }
    });

    noble.on('discover', (peripheral) => {
      this.handleDeviceDiscovery(peripheral);
    });
  }

  handleDeviceDiscovery(peripheral) {
    try {
      const deviceId = peripheral.id;
      const deviceName = peripheral.advertisement?.localName || 'Unknown';
      const serviceUuids = peripheral.advertisement?.serviceUuids || [];
      
      // Check if this is a Kraken device
      const hasKrakenService = serviceUuids.some(uuid => 
        uuid?.toLowerCase().replace(/-/g, '') === KRAKEN_CONSTANTS.SERVICE_UUID.toLowerCase().replace(/-/g, '')
      );
      
      // Also check by device name as fallback (for Windows BLE issues)
      const isKrakenByName = deviceName.toLowerCase().includes('kraken');
      
      if (!hasKrakenService && !isKrakenByName) {
        return;
      }

      // Filter out devices without names (usually indicates incomplete advertisement)
      if (!deviceName || deviceName === 'Unknown') {
        return;
      }

      const deviceInfo = {
        id: deviceId,
        name: deviceName,
        rssi: peripheral.rssi,
        address: peripheral.address,
        serviceUuids,
        peripheral
      };

      // Always update device info for continuous live updates
      const isNewDevice = !this.discoveredDevices.has(deviceId);
      this.discoveredDevices.set(deviceId, deviceInfo);
      
      if (isNewDevice) {
        this.emit('deviceDiscovered', deviceInfo);
      } else {
        // Always emit update for live signal strength (like old app)
        this.emit('deviceUpdated', deviceInfo);
      }


    } catch (error) {
      console.error('Error handling device discovery:', error);
    }
  }

  async startScanning() {
    try {
      if (this.isScanning) {
        await this.stopScanning();
      }

      if (this.bluetoothState !== 'poweredOn') {
        throw new Error('Bluetooth is not powered on');
      }

      this.isScanning = true;
      this.discoveredDevices.clear();
      
      await noble.startScanningAsync([], true); // Allow duplicates for RSSI updates
      
      this.emit('scanStarted');
      
      return true;
    } catch (error) {
      this.isScanning = false;
      console.error('Failed to start scanning:', error);
      this.emit('scanError', error);
      throw error;
    }
  }

  async stopScanning() {
    try {
      if (this.isScanning) {
        await noble.stopScanningAsync();
        this.isScanning = false;
        this.emit('scanStopped');
      }
    } catch (error) {
      console.error('Error stopping scan:', error);
      this.emit('scanError', error);
    }
  }

  async refreshScan() {
    try {
      await this.stopScanning();
      await new Promise(resolve => setTimeout(resolve, KRAKEN_CONSTANTS.SCANNER_REFRESH_DELAY)); // Brief pause
      await this.startScanning();
    } catch (error) {
      console.error('Error refreshing scan:', error);
      throw error;
    }
  }

  getDiscoveredDevices() {
    return Array.from(this.discoveredDevices.values());
  }

  getDevice(deviceId) {
    return this.discoveredDevices.get(deviceId);
  }

  isBluetoothReady() {
    return this.bluetoothState === 'poweredOn';
  }

  getScanStatus() {
    return {
      isScanning: this.isScanning,
      bluetoothState: this.bluetoothState,
      deviceCount: this.discoveredDevices.size
    };
  }

  async cleanup() {
    await this.stopScanning();
    this.discoveredDevices.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
let scannerInstance = null;

export function getKrakenScanner() {
  if (!scannerInstance) {
    scannerInstance = new KrakenScannerService();
  }
  return scannerInstance;
}

export { KrakenScannerService }; 