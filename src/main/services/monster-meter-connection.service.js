import EventEmitter from 'events';
import { SerialPort } from 'serialport';
import usb from 'usb';
import { MONSTER_METER_CONSTANTS } from '../../config/constants/monster-meter.constants.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Monster Meter Connection Service - Handles serial port connections to Monster Meter devices
 */
class MonsterMeterConnectionService extends EventEmitter {
  constructor() {
    super();
    this.connectedPort = null;
    this.selectedPortPath = null;
    this.availablePorts = [];
    this.isConnected = false;
    this.isMonitoring = false;
    this.usbAttachListener = null;
    this.usbDetachListener = null;
    this.pollingInterval = null;
    this.lastPortCount = 0;
  }

  startDeviceMonitoring() {
    if (this.isMonitoring) return;

    try {
      console.log('Starting USB device monitoring...');

      // Check if usb package is available and has the required methods
      if (!usb || typeof usb.on !== 'function' || typeof usb.removeListener !== 'function') {
        throw new Error('USB package not properly initialized or missing required methods');
      }

      this.usbAttachListener = device => {
        console.log('USB device attached:', this.getDeviceInfo(device));
        this.emit('deviceAdded', device);
        this.schedulePortRefresh('attachment', MONSTER_METER_CONSTANTS.USB_ATTACH_DELAY);
      };

      this.usbDetachListener = device => {
        console.log('USB device detached:', this.getDeviceInfo(device));
        this.emit('deviceRemoved', device);
        this.schedulePortRefresh('detachment', MONSTER_METER_CONSTANTS.USB_DETACH_DELAY);
      };

      this.safeUsbOperation(() => {
        usb.on('attach', this.usbAttachListener);
        usb.on('detach', this.usbDetachListener);
      });

      this.isMonitoring = true;
      console.log('USB device monitoring started successfully');
      this.startPolling();
    } catch (error) {
      this.handleError('startDeviceMonitoring', error);
      console.log('Continuing without USB auto-monitoring - using polling fallback');
      this.isMonitoring = true;
      this.startPolling();
    }
  }

  startPolling() {
    if (this.pollingInterval) return;

    console.log(`Starting port polling mechanism (every ${MONSTER_METER_CONSTANTS.POLLING_INTERVAL / 1000} seconds)`);
    this.pollingInterval = setInterval(async () => {
      try {
        const ports = await SerialPort.list();
        const currentPortCount = ports.length;

        if (currentPortCount !== this.lastPortCount) {
          console.log(`Port count changed: ${this.lastPortCount} -> ${currentPortCount}, refreshing port list`);
          this.lastPortCount = currentPortCount;
          await this.refreshPortList();
        }
      } catch (error) {
        this.handleError('portPolling', error);
      }
    }, MONSTER_METER_CONSTANTS.POLLING_INTERVAL);
  }

  stopPolling() {
    if (this.pollingInterval) {
      console.log('Stopping port polling mechanism');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  stopDeviceMonitoring() {
    if (!this.isMonitoring) return;

    try {
      console.log('Stopping USB device monitoring...');

      // Safely remove USB listeners
      this.safeUsbOperation(() => {
        if (this.usbAttachListener) {
          usb.removeListener('attach', this.usbAttachListener);
          this.usbAttachListener = null;
        }

        if (this.usbDetachListener) {
          usb.removeListener('detach', this.usbDetachListener);
          this.usbDetachListener = null;
        }
      });

      this.isMonitoring = false;
      console.log('USB device monitoring stopped successfully');
      this.stopPolling();
    } catch (error) {
      this.handleError('stopDeviceMonitoring', error);
      this.isMonitoring = false;
      this.stopPolling();
    }
  }

  getConnectedUsbDevices() {
    return this.safeUsbOperation(() => {
      return usb.getDeviceList().map(device => ({
        idVendor: device.deviceDescriptor?.idVendor,
        idProduct: device.deviceDescriptor?.idProduct,
        manufacturer: device.deviceDescriptor?.iManufacturer,
        product: device.deviceDescriptor?.iProduct,
        serialNumber: device.deviceDescriptor?.iSerialNumber,
        deviceClass: device.deviceDescriptor?.bDeviceClass,
        deviceSubClass: device.deviceDescriptor?.bDeviceSubClass,
      }));
    }, []);
  }

  async getAvailablePorts() {
    try {
      const ports = await SerialPort.list();
      this.availablePorts = ports;
      this.lastPortCount = ports.length;
      this.emit('portsUpdated', ports);
      return ports;
    } catch (error) {
      this.handleError('getAvailablePorts', error);
      this.emit('portListError', error);
      return [];
    }
  }

  async refreshPortList() {
    return await this.getAvailablePorts();
  }

  async connectToPort(portPath) {
    console.log(`[Connection] Starting connection to port: ${portPath}`);

    if (this.isConnected && this.connectedPort) {
      await this.disconnect();
    }

    this.selectedPortPath = portPath;
    this.emit('connectionStarted', { port: portPath });

    return new Promise((resolve, reject) => {
      const port = new SerialPort({
        path: portPath,
        baudRate: MONSTER_METER_CONSTANTS.BAUD_RATE,
        autoOpen: false,
      });

      this.setupPortEventListeners(port);

      port.open(err => {
        if (err) {
          console.error(`[Connection] Failed to open port ${portPath}:`, err.message);
          this.emit('connectionError', { port: portPath, error: err.message });
          return reject(err);
        }

        console.log(`[Connection] Port ${portPath} opened successfully`);
        this.connectedPort = port;
        this.isConnected = true;

        // Get and log Monster Meter serial number
        this.logMonsterMeterSerialNumber(portPath);

        this.emit('connected', { port: portPath });
        resolve(port);
      });
    });
  }

  setupPortEventListeners(port) {
    const events = {
      open: () => {
        console.log(`Serial port ${this.selectedPortPath} opened`);
        this.emit('portOpened', { port: this.selectedPortPath });
      },
      close: () => {
        console.log('Serial port closed');
        const wasConnected = this.isConnected;
        const portPath = this.selectedPortPath;

        this.resetConnectionState();
        this.emit('portClosed', { port: portPath });

        if (wasConnected) {
          this.emit('disconnected', { port: portPath });
        }
      },
      error: error => {
        console.error('Serial port error:', error);
        this.resetConnectionState();
        this.emit('portError', { port: this.selectedPortPath, error: error.message });
      },
    };

    Object.entries(events).forEach(([event, handler]) => port.on(event, handler));
  }

  async disconnect() {
    if (!this.connectedPort || !this.isConnected) return;

    try {
      this.connectedPort.removeAllListeners();

      await new Promise((resolve, reject) => {
        this.connectedPort.close(error => (error ? reject(error) : resolve()));
      });

      this.resetConnectionState();
      this.emit('disconnected');
    } catch (error) {
      this.handleError('disconnect', error);
      throw error;
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      selectedPort: this.selectedPortPath,
      availablePortsCount: this.availablePorts.length,
    };
  }

  getConnectedPort() {
    return this.connectedPort;
  }

  // Helper methods
  getDeviceInfo(device) {
    return {
      idVendor: device.deviceDescriptor?.idVendor,
      idProduct: device.deviceDescriptor?.idProduct,
    };
  }

  // Safe USB operations wrapper
  safeUsbOperation(operation, fallback = null) {
    try {
      if (!usb) {
        console.log('USB package not available');
        return fallback;
      }
      return operation();
    } catch (error) {
      console.error('USB operation failed:', error);
      return fallback;
    }
  }

  schedulePortRefresh(reason, delay) {
    const seconds = delay / 1000;
    console.log(`USB device ${reason} - refreshing port list in ${seconds} second${seconds !== 1 ? 's' : ''}...`);
    setTimeout(async () => {
      console.log(`Auto-refreshing port list due to USB device ${reason}`);
      await this.refreshPortList();
    }, delay);
  }

  resetConnectionState() {
    this.isConnected = false;
    this.connectedPort = null;
    this.selectedPortPath = null;
  }

  handleError(method, error) {
    Sentry.captureException(error, {
      tags: { service: 'monster-meter-connection', method },
    });
    console.error(`Failed in ${method}:`, error);
  }

  /**
   * Get and log Monster Meter serial number from FTDI device
   */
  async logMonsterMeterSerialNumber(portPath) {
    try {
      const ports = await SerialPort.list();

      // Find the FTDI device that matches our connected port
      const ftdiDevice = ports.find(p => p.path === portPath && p.vendorId?.toLowerCase() === '0403' && p.productId?.toLowerCase() === '6001');

      if (ftdiDevice) {
        const serialNumber = ftdiDevice.serialNumber || 'N/A';

        console.log('🔍 Monster Meter Device Info:');
        console.log(`  📍 Port: ${ftdiDevice.path}`);
        console.log(`  🔢 Serial Number: ${serialNumber}`);
        console.log(`  🏭 Manufacturer: ${ftdiDevice.manufacturer || 'N/A'}`);
        console.log(`  📝 Description: ${ftdiDevice.friendlyName || ftdiDevice.pnpId || 'N/A'}`);
        // i want to send the monster meeter serial number to sentry
        Sentry.captureMessage(`Monster Meter Device Info: ${serialNumber}`, {
          tags: { service: 'monster-meter-connection', method: 'logMonsterMeterSerialNumber' },
        });
      }
    } catch (error) {
      this.handleError('logMonsterMeterSerialNumberError', error);
    }
  }

  async cleanup() {
    console.log('[Connection] Starting cleanup...');

    this.stopDeviceMonitoring();
    this.stopPolling();

    if (this.isConnected) {
      await this.disconnect();
    }

    // Reset all state
    Object.assign(this, {
      connectedPort: null,
      selectedPortPath: null,
      availablePorts: [],
      isConnected: false,
      isMonitoring: false,
      usbAttachListener: null,
      usbDetachListener: null,
      pollingInterval: null,
      lastPortCount: 0,
    });

    this.removeAllListeners();
    console.log('[Connection] Cleanup completed');
  }

  async destroy() {
    await this.cleanup();
    connectionInstance = null;
    console.log('[Connection] Service destroyed');
  }
}

// Singleton instance
let connectionInstance = null;

export function getMonsterMeterConnection() {
  if (!connectionInstance) {
    connectionInstance = new MonsterMeterConnectionService();
  }
  return connectionInstance;
}

export { MonsterMeterConnectionService };
