import EventEmitter from 'events';

/**
 * Monster Meter State Service
 * Manages state for connected Monster Meter devices
 */
class MonsterMeterStateService extends EventEmitter {
  constructor() {
    super();
    this.connectedDevice = null;
    this.availablePorts = [];
    this.isConnected = false;
    this.deviceData = null;
    this.oldCoefficients = null;
  }

  /**
   * Set connected Monster Meter device
   */
  setConnectedDevice(deviceInfo) {
    this.connectedDevice = deviceInfo;
    this.isConnected = true;
    this.deviceData = deviceInfo.data;
    this.emit('deviceConnected', deviceInfo);
  }

  /**
   * Remove connected Monster Meter device
   */
  removeConnectedDevice() {
    const previousDevice = this.connectedDevice;
    this.connectedDevice = null;
    this.isConnected = false;
    this.deviceData = null;
    this.emit('deviceDisconnected', previousDevice);
  }

  /**
   * Update device data
   */
  updateDeviceData(data) {
    if (this.connectedDevice) {
      this.deviceData = data;
      this.connectedDevice.data = data;
      this.emit('deviceDataUpdated', data);
    }
  }

  /**
   * Set available ports
   */
  setAvailablePorts(ports) {
    this.availablePorts = ports;
    this.emit('portsUpdated', ports);
  }

  /**
   * Store old coefficients from Monster Meter
   */
  setOldCoefficients(coefficients) {
    this.oldCoefficients = coefficients;
    this.emit('coefficientsStored', coefficients);
  }

  /**
   * Get stored old coefficients
   */
  getOldCoefficients() {
    return this.oldCoefficients;
  }

  /**
   * Clear old coefficients
   */
  clearOldCoefficients() {
    this.oldCoefficients = null;
    this.emit('coefficientsCleared');
  }

  /**
   * Get current state
   */
  getState() {
    return {
      connectedDevice: this.connectedDevice,
      availablePorts: this.availablePorts,
      isConnected: this.isConnected,
      deviceData: this.deviceData,
      oldCoefficients: this.oldCoefficients,
    };
  }

  /**
   * Cleanup state service
   */
  cleanup() {
    console.log('[State] Starting cleanup...');

    // Clear all state
    this.connectedDevice = null;
    this.availablePorts = [];
    this.isConnected = false;
    this.deviceData = null;
    this.oldCoefficients = null;

    // Remove all event listeners
    this.removeAllListeners();

    console.log('[State] Cleanup completed');
  }

  /**
   * Destroy the state service instance
   */
  destroy() {
    this.cleanup();
    // Reset singleton instance
    stateInstance = null;
    console.log('[State] Service destroyed');
  }
}

// Singleton instance
let stateInstance = null;

export function getMonsterMeterState() {
  if (!stateInstance) {
    stateInstance = new MonsterMeterStateService();
  }
  return stateInstance;
}

export { MonsterMeterStateService };
