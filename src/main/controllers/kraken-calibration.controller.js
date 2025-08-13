import { getKrakenConnection } from '../services/kraken-connection.service.js';
import { getKrakenScanner } from '../services/kraken-scanner.service.js';
import { getKrakenCalibrationState } from '../../state/kraken-calibration-state.service.js';
import { KRAKEN_CONSTANTS } from '../constants/kraken.constants.js';
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
    this.monitoringInterval = 2000; // Check every 2 seconds
    
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
    this.connection.on('deviceDisconnected', (deviceId) => {
      this.handleDeviceDisconnection(deviceId);
    });

    // Global state events
    this.globalState.on('deviceStatusUpdate', ({ deviceId, status }) => {
      this.sendToRenderer('device-status-update', { deviceId, status });
      this.updateProgressSummary();
    });
  }

  /**
   * Initialize calibration with connected devices
   * @param {string[]} connectedDeviceIds - Array of device IDs
   * @returns {Promise<{success: boolean, deviceCount?: number, error?: string}>}
   */
  async initialize(connectedDeviceIds) {
    try {
      this.sendToRenderer('show-page-loader');
      
      const devices = this.globalState.getConnectedDevices();
      if (devices.length === 0) {
        throw new Error('No connected devices found in global state');
      }

      // Initialize UI with devices
      const formattedDevices = devices.map(device => this.formatDeviceForRenderer(device));
      this.sendToRenderer('initialize-devices', formattedDevices);
      this.sendToRenderer('hide-page-loader');
      
      // Start sequential setup after delay (like old app)
      console.log('Waiting 1 second before starting device setup...');
      await this.globalState.addDelay(1000);
      await this.startSequentialSetup();
      
      // Start connectivity monitoring after setup
      this.startConnectivityMonitoring();
      
      return { success: true, deviceCount: devices.length };
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
        
        const success = await this.setupDevice(deviceId);
        
        if (!success) {
          console.log(`Setup failed for device ${deviceId}, stopping sequential setup`);
          break;
        }
        
        // Delay between device setups (like old app)
        if (i < setupQueue.length - 1) {
          console.log('Waiting 1 second before next device setup...');
          await this.globalState.addDelay(1000);
        }
      }
      
      this.checkAllDevicesReady();
    } finally {
      this.globalState.isSetupInProgress = false;
    }
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
        message: 'Discovering services and characteristics...' 
      });

      // Discover services and characteristics
      const { services, characteristics } = await discoverWithTimeout(
        device.peripheral, 
        KRAKEN_CONSTANTS.DISCOVERY_TIMEOUT
      );
      
      // Setup pressure data subscription
      await this.setupPressureSubscription(device, characteristics);

      // Store characteristics for cleanup and mark as ready
      this.globalState.setDeviceCharacteristics(deviceId, characteristics);
      this.globalState.updateDeviceStatus(deviceId, 'ready', 'complete', null, services, characteristics);
      this.sendToRenderer('device-setup-complete', { deviceId });

      return true;
    } catch (error) {
      console.error(`Error setting up device ${deviceId}:`, error);
      this.globalState.updateDeviceStatus(deviceId, 'failed', 'error', error.message);
      this.sendToRenderer('device-setup-failed', { 
        deviceId, 
        error: error.message 
      });
      return false;
    }
  }

  async ensureDeviceConnected(device, deviceId) {
    if (device.peripheral && device.peripheral.state === 'connected') {
      return; // Already connected
    }

    console.log(`Device ${deviceId} is not connected (state: ${device.peripheral?.state || 'null'}), reconnecting...`);
    
    this.globalState.updateDeviceStatus(deviceId, 'in-progress', 'connecting');
    this.sendToRenderer('device-setup-stage', { 
      deviceId, 
      stage: 'connecting',
      message: 'Reconnecting to device...' 
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
          
          freshPeripheral.connect((error) => {
            clearTimeout(timeout);
            if (error) {
              // Check if error is about already being connected
              if (error.message.includes('already connected') || error.message.includes('Peripheral already connected')) {
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

  async setupPressureSubscription(device, characteristics) {
    this.sendToRenderer('device-setup-stage', { 
      deviceId: device.id, 
      stage: 'subscribing',
      message: 'Setting up pressure subscription...' 
    });

    // Find pressure characteristic
    const pressureUuid = KRAKEN_CONSTANTS.PRESSURE_CHARACTERISTIC_UUID.toLowerCase().replace(/-/g, '');
    const dataChar = characteristics.find(char => 
      char.uuid.toLowerCase().replace(/-/g, '') === pressureUuid
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

      dataChar.subscribe((error) => {
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
          unit: 'PSI'
        },
        timestamp: Date.now() 
      });
    } catch (error) {
      console.error(`Error parsing data from device ${deviceId}:`, error);
    }
  }

  /**
   * Retry setup for a specific device with robust reconnection
   * @param {string} deviceId - Device ID to retry
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async retryDeviceSetup(deviceId) {
    try {
      const deviceIndex = this.globalState.setupQueue.indexOf(deviceId);
      if (deviceIndex === -1) {
        return { success: false, error: 'Device not found in setup queue' };
      }

      // Check retry limits
      if (!this.globalState.canRetryDevice(deviceId)) {
        const retryCount = this.globalState.getRetryCount(deviceId);
        return { 
          success: false, 
          error: `Max retries (${this.globalState.maxRetries}) exceeded. Attempted ${retryCount} times.` 
        };
      }

      console.log(`Starting retry for device ${deviceId} (attempt ${this.globalState.getRetryCount(deviceId) + 1}/${this.globalState.maxRetries})`);

      // Reset device status and attempt reconnection
      this.globalState.updateDeviceStatus(deviceId, 'pending', 'reconnecting');
      
      const reconnectedDevice = await this.globalState.reconnectDevice(deviceId);
      console.log(`Successfully reconnected device ${deviceId}, starting setup...`);

      // Reset retry count and device status on successful reconnection
      this.globalState.resetRetryCount(deviceId);
      this.globalState.updateDeviceStatus(deviceId, 'pending', 'waiting');
      
      // Setup this specific device
      const success = await this.setupDevice(deviceId);
      
      if (success) {
        console.log(`Device ${deviceId} setup completed successfully after retry`);
        // Continue with remaining devices
        this.globalState.currentSetupIndex = deviceIndex + 1;
        if (this.globalState.currentSetupIndex < this.globalState.setupQueue.length) {
          await this.startSequentialSetup();
        }
      }

      return { success };
      
    } catch (error) {
      console.error(`Error in retry process for device ${deviceId}:`, error);
      this.globalState.updateDeviceStatus(deviceId, 'failed', 'error', error.message);
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
      stage: 'waiting' 
    };
    
    return {
      id: device.id,
      name: device.name,
      displayName: device.displayName || device.name,
      firmwareVersion: device.firmwareVersion || 'Unknown',
      minPressure: device.minPressure || 0,
      maxPressure: device.maxPressure || 100,
      status: status.status,
      stage: status.stage,
      error: status.error
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
      message: 'Device has disconnected. Please reconnect to continue.' 
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
        // Connect with timeout only if not already connected
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Reconnection timeout'));
          }, KRAKEN_CONSTANTS.CONNECTION_TIMEOUT);
          
          freshPeripheral.connect((error) => {
            clearTimeout(timeout);
            if (error) {
              // Check if error is about already being connected
              if (error.message.includes('already connected') || error.message.includes('Peripheral already connected')) {
                console.log(`Device ${deviceId} was already connected, continuing with setup`);
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
      }

      // Update device with connected peripheral
      const device = this.globalState.connectedDevices.get(deviceId);
      if (device) {
        device.peripheral = freshPeripheral;
        this.globalState.connectedDevices.set(deviceId, device);
      }

      // Re-setup the device (discover services and subscribe)
      const success = await this.setupDevice(deviceId);
      
      if (success) {
        this.sendToRenderer('device-reconnection-success', { deviceId });
        return { success: true };
      } else {
        throw new Error('Failed to setup device after reconnection');
      }

    } catch (error) {
      console.error(`Failed to reconnect device ${deviceId}:`, error);
      this.globalState.updateDeviceStatus(deviceId, 'disconnected', 'offline', error.message);
      this.sendToRenderer('device-reconnection-failed', { 
        deviceId, 
        error: error.message 
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
      new Promise((resolve) => {
        setTimeout(() => {
          console.warn(`Manual disconnect timeout for device ${deviceId}, forcing removal`);
          resolve(this.forceRemoveDevice(deviceId));
        }, 10000); // 10 second timeout for entire operation
      })
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
          await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              console.warn(`Disconnect timeout for device ${deviceId}, proceeding with removal`);
              resolve();
            }, 3000); // Reduced timeout for faster removal
            
            device.peripheral.disconnect((error) => {
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
        console.log(`Device ${deviceId} peripheral not connected or not discoverable, skipping disconnect attempt`);
      }

      // Complete the removal process
      return this.completeDeviceRemoval(deviceId, isDeviceDiscoverable 
        ? 'Device manually disconnected and removed'
        : 'Device removed from list (device was turned off)');

    } catch (error) {
      console.error(`Error manually disconnecting device ${deviceId}:`, error);
      this.sendToRenderer('device-manual-disconnect-failed', { 
        deviceId, 
        error: error.message 
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
    const allDevicesReady = devices.length > 0 && devices.every(device => {
      const status = this.globalState.getDeviceStatus(device.id);
      return status?.status === 'ready' && 
             device.peripheral && 
             device.peripheral.state === 'connected';
    });

    this.sendToRenderer('update-calibration-button-state', { 
      enabled: allDevicesReady,
      deviceCount: devices.length 
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
