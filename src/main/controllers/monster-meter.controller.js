import { getMonsterMeterConnection } from '../services/monster-meter-connection.service.js';
import { getMonsterMeterCommunication } from '../services/monster-meter-communication.service.js';
import { getMonsterMeterState } from '../../state/monster-meter-state.service.js';
import { sentryLogger } from '../loggers/sentry.logger.js';

/**
 * Monster Meter Controller - Orchestrates Monster Meter connectivity and communication
 */
class MonsterMeterController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.connection = getMonsterMeterConnection();
    this.communication = getMonsterMeterCommunication();
    this.state = getMonsterMeterState();

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Connection events
    this.connection.on('connected', () => console.log('Monster Meter connected successfully'));
    this.connection.on('disconnected', () => {
      console.log('Monster Meter disconnected');
      this.state.removeConnectedDevice();
    });
    this.connection.on('connectionError', ({ port, error }) => {
      console.error('Monster Meter connection error:', error);
      this.sendToRenderer('monster-meter-connection-error', { port, error });
    });
    this.connection.on('portsUpdated', ports => {
      console.log('Available ports updated:', ports);
      this.state.setAvailablePorts(ports);
      this.sendToRenderer('monster-meter-ports-updated', ports);
    });

    // State events
    this.state.on('deviceConnected', deviceInfo => {
      this.sendToRenderer('monster-meter-connected', deviceInfo);
      this.sendToRenderer('monster-meter-data-updated', deviceInfo);
    });

    this.state.on('deviceDisconnected', () => this.sendToRenderer('monster-meter-disconnected'));

    this.state.on('deviceDataUpdated', () => {
      const deviceInfo = this.state.getState().connectedDevice;
      this.sendToRenderer('monster-meter-data-updated', deviceInfo);
    });
  }

  async initialize() {
    try {
      console.log('Initializing Monster Meter controller...');
      this.connection.startDeviceMonitoring();
      await this.refreshPortList();
      console.log('Monster Meter controller initialized successfully');
    } catch (error) {
      this.handleError('initialize', error, 'Failed to initialize Monster Meter system');
    }
  }

  async refreshPortList() {
    try {
      const ports = await this.connection.getAvailablePorts();
      this.sendToRenderer('monster-meter-ports-updated', ports);
      return ports;
    } catch (error) {
      this.handleError('refreshPortList', error, 'Failed to refresh port list');
      return [];
    }
  }

  async connectToPort(portPath) {
    try {
      console.log(`[Monster Meter] Starting connection to port: ${portPath}`);

      const port = await this.connection.connectToPort(portPath);
      console.log(`[Monster Meter] Serial port opened successfully`);

      this.communication.setPort(port);

      console.log(`[Monster Meter] Getting data from Monster Meter...`);
      const deviceData = await this.communication.readData();

      if (!deviceData) {
        throw new Error('No device data received - device may not be a Monster Meter');
      }

      console.log(`[Monster Meter] Device data received successfully`);
      console.log(`[Monster Meter] SW_Version: "${deviceData.SW_Version}"`);
      console.log(`[Monster Meter] Available data keys:`, Object.keys(deviceData));

      const deviceInfo = {
        port: portPath,
        name: deviceData.SW_Version || 'N/A',
        deviceName: deviceData.SW_Version || 'Monster Meter',
        swVersion: deviceData.SW_Version || 'Unknown',
        data: this.communication.getDisplayData(deviceData),
        rawData: deviceData,
      };

      this.state.setConnectedDevice(deviceInfo);
      // Extract and store old coefficients
      const oldCoefficients = this.extractCoefficients(deviceData);
      if (oldCoefficients) {
        this.state.setOldCoefficients(oldCoefficients);
      }
      console.log('[Monster Meter] Successfully connected and device info stored');

      return { success: true, deviceInfo };
    } catch (error) {
      this.handleError('connectToPort', error, null, { portPath });
      this.sendToRenderer('monster-meter-connection-error', { port: portPath, error: error.message });
      throw error;
    }
  }

  async disconnect() {
    try {
      // Stop calibration if active due to disconnection
      if (this.monsterMeterCalibrationService && this.monsterMeterCalibrationService.isCalibrationActive) {
        await this.monsterMeterCalibrationService.stopCalibration('Monster Meter disconnected');
      }

      await this.connection.disconnect();
      this.communication.cleanup();
      this.state.removeConnectedDevice();
      console.log('Disconnected from Monster Meter');
    } catch (error) {
      this.handleError('disconnect', error);
    }
  }

  getCurrentDeviceInfo() {
    return this.state.getState().connectedDevice;
  }

  getConnectionStatus() {
    const state = this.state.getState();
    return {
      ...this.connection.getConnectionStatus(),
      ...state,
      usbDevices: this.connection.getConnectedUsbDevices(),
    };
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  handleError(method, error, userMessage = null, extra = {}) {
    sentryLogger.handleError(error, {
      module: 'monster-meter',
      service: 'monster-meter-controller',
      method,
      extra,
    });
    console.error(`Error in ${method}:`, error);

    if (userMessage) {
      this.sendToRenderer('monster-meter-error', { message: userMessage });
    }
  }

  async cleanup() {
    try {
      console.log('[Controller] Starting cleanup...');
      await this.disconnect();
      await this.connection.cleanup();
      this.communication.cleanup();
      this.state.cleanup();
      this.connection = this.communication = this.state = this.mainWindow = null;
      console.log('[Controller] Cleanup completed');
    } catch (error) {
      this.handleError('cleanup', error);
    }
  }

  /**
   * Get the state service instance
   * @returns {MonsterMeterStateService} The state service
   */
  getStateService() {
    return this.state;
  }

  /**
   * Get the communication service instance
   * @returns {MonsterMeterCommunicationService} The communication service
   */
  getCommunicationService() {
    return this.communication;
  }

  setCalibrationService(calibrationService) {
    this.monsterMeterCalibrationService = calibrationService;
  }

  /**
   * Extract coefficients from Monster Meter device data
   */
  extractCoefficients(data) {
    try {
      if (!data) return null;

      const coefficients = {
        hi: {
          coeffA: data['SensorHi.coeA'],
          coeffB: data['SensorHi.coeB'],
          coeffC: data['SensorHi.coeC'],
        },
        lo: {
          coeffA: data['SensorLo.coeA'],
          coeffB: data['SensorLo.coeB'],
          coeffC: data['SensorLo.coeC'],
        },
      };

      // Check if we have valid coefficient data
      const hasValidCoefficients =
        coefficients.hi.coeffA !== undefined &&
        coefficients.hi.coeffB !== undefined &&
        coefficients.hi.coeffC !== undefined &&
        coefficients.lo.coeffA !== undefined &&
        coefficients.lo.coeffB !== undefined &&
        coefficients.lo.coeffC !== undefined;

      return hasValidCoefficients ? coefficients : null;
    } catch (error) {
      this.handleError('extractCoefficients', error);
      return null;
    }
  }

  async destroy() {
    try {
      console.log('[Controller] Starting destruction...');
      await this.cleanup();

      // Use optional chaining for cleaner code
      await this.connection?.destroy();
      this.communication?.destroy();
      this.state?.destroy();

      console.log('[Controller] Destruction completed');
    } catch (error) {
      this.handleError('destroy', error);
    }
  }
}

export { MonsterMeterController };
