import { getKrakenConnection } from '../services/kraken-connection.service.js';
import { getKrakenScanner } from '../services/kraken-scanner.service.js';
import { getKrakenCalibrationState } from '../../state/kraken-calibration-state.service.js';
import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import { parsePressureData, discoverWithTimeout } from '../utils/ble.utils.js';

/**
 * Kraken Calibration Controller
 * Manages the sequential setup and calibration of multiple Kraken devices
 */
class KrakenCalibrationController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.connection = getKrakenConnection();
    this.scanner = getKrakenScanner();
    this.globalState = getKrakenCalibrationState();

    // Connectivity monitoring
    this.connectivityMonitor = null;
    this.monitoringInterval = KRAKEN_CONSTANTS.CONNECTIVITY_MONITOR_INTERVAL; // Check every 2 seconds

    this.initializeServices();
    this.setupEventListeners();
  }

  initializeServices() {
    this.globalState.setMainWindow(this.mainWindow);
    this.globalState.setController(this);
    this.globalState.setServices(this.scanner, this.connection);
  }

  setupEventListeners() {
    // Connection events
    this.connection.on('deviceDisconnected', deviceId => {
      this.handleDeviceDisconnection(deviceId);
    });

    // Global state events
    this.globalState.on('deviceStatusUpdate', ({ deviceId, status }) => {
      this.sendToRenderer('device-status-update', { deviceId, status });
      this.updateProgressSummary();
    });
  }

  async initialize() {
    try {
      this.sendToRenderer('show-page-loader');

      const devices = this.globalState.getConnectedDevices();
      if (devices.length === 0) {
        throw new Error('No connected devices found in global state');
      }

      // Validate that all devices from the list are still connected
      const validDevices = [];
      const connectionService = this.connection;

      for (const device of devices) {
        const isConnected = connectionService.isDeviceConnected(device.id);
        const connectedDevice = connectionService.getConnectedDevice(device.id);

        if (
          isConnected &&
          connectedDevice &&
          connectedDevice.connectionState === KRAKEN_CONSTANTS.CONNECTION_STATES.CONNECTED
        ) {
          validDevices.push(device);
          console.log(`Device ${device.id} validated as connected`);
        } else {
          console.warn(`Device ${device.id} is not properly connected, excluding from calibration`);
        }
      }

      if (validDevices.length === 0) {
        throw new Error('No valid connected devices found for calibration');
      }

      if (validDevices.length !== devices.length) {
        console.warn(
          `${devices.length - validDevices.length} devices were dropped during validation`
        );
        // Update global state with only valid devices
        this.globalState.setConnectedDevices(validDevices);
      }

      // Initialize UI with validated devices
      const formattedDevices = validDevices.map(device => this.formatDeviceForRenderer(device));
      this.sendToRenderer('initialize-devices', formattedDevices);
      this.sendToRenderer('hide-page-loader');

      console.log(`Initializing calibration with ${validDevices.length} validated devices`);

      // Start sequential setup after delay (like old app)
      console.log(
        `Waiting ${KRAKEN_CONSTANTS.DELAY_BEFORE_SETUP}ms before starting device setup...`
      );
      await this.globalState.addDelay(KRAKEN_CONSTANTS.DELAY_BEFORE_SETUP);
      await this.startSequentialSetup();

      // Start connectivity monitoring after setup
      this.startConnectivityMonitoring();

      return { success: true, deviceCount: validDevices.length };
    } catch (error) {
      console.error('Error initializing kraken calibration:', error);
      this.sendToRenderer('hide-page-loader');
      return { success: false, error: error.message };
    }
  }

  /**
   * Start sequential setup of devices with delays between each
   * @returns {Promise<void>}
   */
  async startSequentialSetup() {
    if (this.globalState.isSetupInProgress) return;

    this.globalState.isSetupInProgress = true;

    try {
      const setupQueue = this.globalState.setupQueue;

      for (let i = this.globalState.currentSetupIndex; i < setupQueue.length; i++) {
        const deviceId = setupQueue[i];
        this.globalState.currentSetupIndex = i;

        console.log(`Starting setup for device ${i + 1}/${setupQueue.length}: ${deviceId}`);

        const success = await this.setupDeviceWithRetries(deviceId);

        if (!success) {
          console.log(
            `Setup failed for device ${deviceId} after retries, continuing with next device`
          );
          // Continue to next device instead of stopping the entire process
        }

        // Delay between device setups
        if (i < setupQueue.length - 1) {
          console.log(
            `Waiting ${KRAKEN_CONSTANTS.DELAY_BETWEEN_SETUP}ms before next device setup...`
          );
          await this.globalState.addDelay(KRAKEN_CONSTANTS.DELAY_BETWEEN_SETUP);
        }
      }

      this.checkAllDevicesReady();
    } finally {
      this.globalState.isSetupInProgress = false;
    }
  }

  /**
   * Setup device with automatic retries (up to 3 attempts)
   * @param {string} deviceId - Device ID to setup
   * @returns {Promise<boolean>} Success status
   */
  async setupDeviceWithRetries(deviceId) {
    const maxRetries = KRAKEN_CONSTANTS.MAX_RETRIES_PER_KRAKEN;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Setup attempt ${attempt}/${maxRetries} for device ${deviceId}`);

        if (attempt > 1) {
          this.sendToRenderer('device-setup-retry', {
            deviceId,
            attempt,
            maxRetries,
            message: `Retry ${attempt}/${maxRetries} - Discovering services and characteristics...`,
          });
          // Wait a bit longer between retries
          await this.globalState.addDelay(KRAKEN_CONSTANTS.DELAY_BETWEEN_RETRIES);
        }

        const success = await this.setupDevice(deviceId);
        if (success) {
          console.log(`Setup successful for device ${deviceId} on attempt ${attempt}`);
          return true;
        }

        throw new Error('Setup failed');
      } catch (error) {
        lastError = error;
        console.warn(
          `Setup attempt ${attempt}/${maxRetries} failed for device ${deviceId}:`,
          error.message
        );

        if (attempt < maxRetries) {
          // Update status to show retry will happen
          this.globalState.updateDeviceStatus(
            deviceId,
            'in-progress',
            'retrying',
            `Attempt ${attempt} failed, retrying...`
          );
        }
      }
    }

    // All retries failed
    console.error(`Setup failed for device ${deviceId} after ${maxRetries} attempts`);
    this.globalState.updateDeviceStatus(
      deviceId,
      'failed',
      'error',
      lastError ? lastError.message : 'Setup failed after retries'
    );
    this.sendToRenderer('device-setup-failed-final', {
      deviceId,
      error: lastError ? lastError.message : 'Setup failed after retries',
      maxRetries,
    });
    return false;
  }

  /**
   * Setup individual device - connection, discovery, and subscription
   * @param {string} deviceId - Device ID to setup
   * @returns {Promise<boolean>} Success status
   */
  async setupDevice(deviceId) {
    try {
      const device = this.globalState.connectedDevices.get(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found in connected devices`);
      }

      // Ensure device is connected before proceeding
      await this.ensureDeviceConnected(device, deviceId);

      // Update UI and state
      this.globalState.updateDeviceStatus(deviceId, 'in-progress', 'discovering');
      this.sendToRenderer('device-setup-started', { deviceId });
      this.sendToRenderer('device-setup-stage', {
        deviceId,
        stage: 'discovering',
        message: 'Discovering services and characteristics...',
      });

      // Discover services and characteristics
      const { services, characteristics } = await discoverWithTimeout(
        device.peripheral,
        KRAKEN_CONSTANTS.DISCOVERY_TIMEOUT
      );

      // Update device details with fresh service discovery (including firmware)
      await this.updateKrakenDetailsFromCharacteristics(device, characteristics, deviceId);

      // Setup pressure data subscription
      await this.setupPressureSubscription(device, characteristics);

      // Store characteristics for cleanup and mark as ready
      this.globalState.setDeviceCharacteristics(deviceId, characteristics);
      this.globalState.updateDeviceStatus(
        deviceId,
        'ready',
        'complete',
        null,
        services,
        characteristics
      );
      this.sendToRenderer('device-setup-complete', { deviceId });

      return true;
    } catch (error) {
      console.error(`Error setting up device ${deviceId}:`, error);
      this.globalState.updateDeviceStatus(deviceId, 'failed', 'error', error.message);
      this.sendToRenderer('device-setup-failed', {
        deviceId,
        error: error.message,
      });
      return false;
    }
  }

  async ensureDeviceConnected(device, deviceId) {
    if (device.peripheral && device.peripheral.state === 'connected') {
      return; // Already connected
    }

    console.log(
      `Device ${deviceId} is not connected (state: ${device.peripheral?.state || 'null'}), reconnecting...`
    );

    this.globalState.updateDeviceStatus(deviceId, 'in-progress', 'connecting');
    this.sendToRenderer('device-setup-stage', {
      deviceId,
      stage: 'connecting',
      message: 'Reconnecting to device...',
    });

    try {
      // Get fresh peripheral and check connection state
      const freshPeripheral = await this.globalState.getFreshPeripheral(deviceId);

      // Check if peripheral is already connected
      if (freshPeripheral.state === 'connected') {
        console.log(`Device ${deviceId} is already connected, skipping connection step`);
        // Update device with connected peripheral
        device.peripheral = freshPeripheral;
        this.globalState.connectedDevices.set(deviceId, device);
      } else {
        // Connect with timeout only if not already connected
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, KRAKEN_CONSTANTS.CONNECTION_TIMEOUT);

          freshPeripheral.connect(error => {
            clearTimeout(timeout);
            if (error) {
              // Check if error is about already being connected
              if (
                error.message.includes('already connected') ||
                error.message.includes('Peripheral already connected')
              ) {
                console.log(`Device ${deviceId} was already connected during setup, continuing`);
                resolve();
              } else {
                reject(error);
              }
            } else {
              console.log(`Device ${deviceId} reconnected successfully`);
              resolve();
            }
          });
        });

        // Update device with connected peripheral
        device.peripheral = freshPeripheral;
        this.globalState.connectedDevices.set(deviceId, device);
      }
    } catch (connectError) {
      console.error(`Failed to reconnect device ${deviceId}:`, connectError);
      throw new Error(`Failed to reconnect: ${connectError.message}`);
    }
  }

  /**
   * Safely read a kraken BLE characteristic with timeout
   * @param {object} characteristic - BLE characteristic
   * @returns {Promise<Buffer|null>} Characteristic data or null on error
   */
  async safeReadKrakenCharacteristic(characteristic) {
    return new Promise(resolve => {
      const timeoutId = setTimeout(() => {
        console.warn(
          `Kraken characteristic read timeout after ${KRAKEN_CONSTANTS.CHARACTERISTIC_READ_TIMEOUT}ms`
        );
        resolve(null);
      }, KRAKEN_CONSTANTS.CHARACTERISTIC_READ_TIMEOUT);

      characteristic.read((error, data) => {
        clearTimeout(timeoutId);
        if (error) {
          console.warn('Kraken characteristic read failed:', error.message);
          resolve(null);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Update kraken device details from freshly discovered characteristics
   * This ensures firmware version and other details are current
   * @param {object} device - Kraken device object
   * @param {array} characteristics - Discovered BLE characteristics
   * @param {string} deviceId - Kraken device ID for logging
   */
  async updateKrakenDetailsFromCharacteristics(device, characteristics, deviceId) {
    this.sendToRenderer('device-setup-stage', {
      deviceId,
      stage: 'reading-details',
      message: 'Reading device information...',
    });

    try {
      // Get firmware version with retry logic
      const firmwareChar = characteristics.find(
        c => c.uuid === KRAKEN_CONSTANTS.FIRMWARE_REVISION_CHARACTERISTIC_UUID
      );

      if (firmwareChar) {
        let firmwareVersion = null;
        let retryCount = 0;
        const maxRetries = 3;

        // Retry firmware reading up to 3 times
        while (!firmwareVersion && retryCount < maxRetries) {
          if (retryCount > 0) {
            console.log(`Device ${deviceId}: Firmware read retry ${retryCount}/${maxRetries}`);
            await this.globalState.addDelay(1000); // Wait 1 second between retries
          }

          const firmwareData = await this.safeReadKrakenCharacteristic(firmwareChar);
          if (firmwareData && firmwareData.length > 0) {
            firmwareVersion = firmwareData.toString('utf8').trim();
            device.firmwareVersion = firmwareVersion;
            console.log(
              `Device ${deviceId}: Updated firmware version to ${firmwareVersion} on attempt ${retryCount + 1}`
            );
          } else {
            retryCount++;
            if (retryCount >= maxRetries) {
              console.warn(
                `Device ${deviceId}: Could not read firmware version after ${maxRetries} attempts`
              );
            }
          }
        }
      } else {
        console.warn(`Device ${deviceId}: Firmware characteristic not found`);
      }

      // Get display name
      const nameChar = characteristics.find(
        c => c.uuid === KRAKEN_CONSTANTS.DISPLAY_NAME_CHARACTERISTIC_UUID
      );

      if (nameChar) {
        const nameData = await this.safeReadKrakenCharacteristic(nameChar);
        if (nameData && nameData.length > 0) {
          const displayName = nameData.toString('utf8').trim();
          if (displayName) {
            device.displayName = displayName;
            console.log(`Device ${deviceId}: Updated display name to ${displayName}`);
          }
        }
      }

      // Update the device in global state with new details
      this.globalState.connectedDevices.set(deviceId, device);

      // Send updated kraken info to renderer
      this.sendToRenderer('kraken-details-updated', {
        deviceId,
        firmwareVersion: device.firmwareVersion,
        displayName: device.displayName,
      });
    } catch (error) {
      console.warn(`Device ${deviceId}: Error reading device details:`, error.message);
      // Don't throw - this is not critical for functionality
    }
  }

  async setupPressureSubscription(device, characteristics) {
    this.sendToRenderer('device-setup-stage', {
      deviceId: device.id,
      stage: 'subscribing',
      message: 'Setting up pressure subscription...',
    });

    // Find pressure characteristic
    const pressureUuid = KRAKEN_CONSTANTS.PRESSURE_CHARACTERISTIC_UUID.toLowerCase().replace(
      /-/g,
      ''
    );
    const dataChar = characteristics.find(
      char => char.uuid.toLowerCase().replace(/-/g, '') === pressureUuid
    );

    if (!dataChar) {
      const availableChars = characteristics.map(c => c.uuid).join(', ');
      console.log(`Available characteristics for device ${device.id}:`, availableChars);
      throw new Error(`Pressure characteristic not found. Available: ${availableChars}`);
    }

    console.log(`Found pressure characteristic for device ${device.id}: ${dataChar.uuid}`);

    // Subscribe to characteristic
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Subscription timeout'));
      }, KRAKEN_CONSTANTS.SUBSCRIPTION_TIMEOUT);

      dataChar.subscribe(error => {
        clearTimeout(timeout);

        if (error) {
          reject(new Error(`Subscription failed: ${error.message}`));
          return;
        }

        // Setup data handler
        const dataHandler = (data, isNotification) => {
          this.handleDeviceData(device.id, data);
        };

        dataChar.on('data', dataHandler);

        // Track subscription for cleanup
        this.globalState.addActiveSubscription(device.id, dataChar, dataHandler);

        resolve();
      });
    });
  }

  /**
   * Handle incoming data from devices
   * @param {string} deviceId - Device ID
   * @param {Buffer} data - Raw BLE data
   */
  handleDeviceData(deviceId, data) {
    try {
      const pressureValue = parsePressureData(data);

      this.sendToRenderer('device-data-update', {
        deviceId,
        pressure: {
          value: pressureValue,
          unit: 'PSI',
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`Error parsing data from device ${deviceId}:`, error);
    }
  }

  /**
   * Retry setup for a specific device (manual retry button)
   * @param {string} deviceId - Device ID to retry
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async retryDeviceSetup(deviceId) {
    try {
      console.log(`Manual retry requested for device ${deviceId}`);

      // Reset device status to show retry is starting
      this.globalState.updateDeviceStatus(
        deviceId,
        'in-progress',
        'retrying',
        'Manual retry in progress...'
      );
      this.sendToRenderer('device-manual-retry-started', { deviceId });

      // Try setup for this device only (don't affect other devices)
      const success = await this.setupDevice(deviceId);

      if (success) {
        console.log(`Device ${deviceId} setup completed successfully after manual retry`);
        this.sendToRenderer('device-manual-retry-success', { deviceId });
        this.checkAllDevicesReady();
        return { success: true };
      } else {
        console.log(`Device ${deviceId} setup failed even after manual retry`);
        this.sendToRenderer('device-manual-retry-failed', {
          deviceId,
          error: 'Setup failed after manual retry',
        });
        return { success: false, error: 'Setup failed after manual retry' };
      }
    } catch (error) {
      console.error(`Error in manual retry process for device ${deviceId}:`, error);
      this.globalState.updateDeviceStatus(deviceId, 'failed', 'error', error.message);
      this.sendToRenderer('device-manual-retry-failed', { deviceId, error: error.message });
      return { success: false, error: error.message };
    }
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
   * Start calibration process
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startCalibration() {
    try {
      if (!this.globalState.areAllDevicesReady()) {
        throw new Error('Not all devices are ready for calibration');
      }

      // TODO: Implement actual calibration logic
      this.sendToRenderer('calibration-started');

      return { success: true };
    } catch (error) {
      console.error('Error starting calibration:', error);
      return { success: false, error: error.message };
    }
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
    let hasDisconnectedDevice = false;

    for (const device of devices) {
      const isConnected = device.peripheral && device.peripheral.state === 'connected';
      const currentStatus = this.globalState.getDeviceStatus(device.id);

      if (!isConnected && currentStatus?.status !== 'disconnected') {
        // Device has disconnected
        console.log(`Device ${device.id} has disconnected`);
        this.handleDeviceConnectivityLoss(device.id);
        hasDisconnectedDevice = true;
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
              if (
                error.message.includes('already connected') ||
                error.message.includes('Peripheral already connected')
              ) {
                console.log(`Device ${deviceId} was already connected, continuing with setup`);
                resolve();
              } else {
                reject(new Error(`Connection failed: ${error.message}`));
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
   * Setup a single device without affecting the sequential setup process
   * This is used for reconnections and individual device setup
   * @param {string} deviceId - Device ID to setup
   * @returns {Promise<boolean>} Success status
   */
  async setupSingleDevice(deviceId) {
    try {
      const device = this.globalState.connectedDevices.get(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found in connected devices`);
      }

      // Ensure device is connected before proceeding
      await this.ensureDeviceConnected(device, deviceId);

      // Update UI and state
      this.globalState.updateDeviceStatus(deviceId, 'in-progress', 'discovering');
      this.sendToRenderer('device-setup-started', { deviceId });
      this.sendToRenderer('device-setup-stage', {
        deviceId,
        stage: 'discovering',
        message: 'Discovering services and characteristics...',
      });

      // Discover services and characteristics
      const { services, characteristics } = await discoverWithTimeout(
        device.peripheral,
        KRAKEN_CONSTANTS.DISCOVERY_TIMEOUT
      );

      // Update device details with fresh service discovery (including firmware)
      await this.updateKrakenDetailsFromCharacteristics(device, characteristics, deviceId);

      // Setup pressure data subscription
      await this.setupPressureSubscription(device, characteristics);

      // Store characteristics for cleanup and mark as ready
      this.globalState.setDeviceCharacteristics(deviceId, characteristics);
      this.globalState.updateDeviceStatus(
        deviceId,
        'ready',
        'complete',
        null,
        services,
        characteristics
      );
      this.sendToRenderer('device-setup-complete', { deviceId });

      return true;
    } catch (error) {
      console.error(`Error setting up device ${deviceId}:`, error);
      this.globalState.updateDeviceStatus(deviceId, 'failed', 'error', error.message);
      this.sendToRenderer('device-setup-failed', {
        deviceId,
        error: error.message,
      });
      return false;
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

      const device = this.globalState.connectedDevices.get(deviceId);
      if (!device) {
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
      } catch (error) {
        isDeviceDiscoverable = false;
      }

      console.log(
        `Device ${deviceId} - Connected: ${isPeripheralConnected}, Discoverable: ${isDeviceDiscoverable}`
      );

      // Fast removal for disconnected and non-discoverable devices
      if (!isPeripheralConnected && !isDeviceDiscoverable) {
        console.log(
          `Device ${deviceId} is already disconnected and not discoverable - fast removal`
        );

        // Quick cleanup of any remaining subscriptions
        this.globalState.activeSubscriptions.delete(deviceId);

        // Skip all disconnect attempts and proceed directly to removal
        return this.completeDeviceRemoval(
          deviceId,
          'Device was already disconnected and turned off'
        );
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

            device.peripheral.disconnect(error => {
              clearTimeout(timeout);
              if (error) {
                console.warn(`Error disconnecting device ${deviceId}:`, error.message);
              }
              resolve();
            });
          });
        } catch (disconnectError) {
          console.warn(`Failed to disconnect device ${deviceId}:`, disconnectError.message);
          // Continue with removal even if disconnect fails
        }
      } else {
        console.log(
          `Device ${deviceId} peripheral not connected or not discoverable, skipping disconnect attempt`
        );
      }

      // Complete the removal process
      return this.completeDeviceRemoval(
        deviceId,
        isDeviceDiscoverable
          ? 'Device manually disconnected and removed'
          : 'Device removed from list (device was turned off)'
      );
    } catch (error) {
      console.error(`Error manually disconnecting device ${deviceId}:`, error);
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
      }

      // Send success event to renderer immediately
      this.sendToRenderer('device-manual-disconnect-success', { deviceId });
      this.updateProgressSummary();
      this.updateCalibrationButtonState();

      console.log(`Device ${deviceId}: ${statusMessage}`);
      return { success: true };
    } catch (error) {
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
        return (
          status?.status === 'ready' && device.peripheral && device.peripheral.state === 'connected'
        );
      });

    this.sendToRenderer('update-calibration-button-state', {
      enabled: allDevicesReady,
      deviceCount: devices.length,
    });
  }

  /**
   * Cleanup all resources and connections
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.stopConnectivityMonitoring();
    await this.globalState.cleanup();
  }
}

export { KrakenCalibrationController };
