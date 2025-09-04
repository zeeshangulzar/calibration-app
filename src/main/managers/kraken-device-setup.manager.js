import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import { GLOBAL_CONSTANTS } from '../../config/constants/global.constants.js';
import { parsePressureData, discoverWithTimeout } from '../utils/ble.utils.js';
import { addDelay } from '../../shared/helpers/calibration-helper.js';

import * as Sentry from '@sentry/electron/main';
/**
 * Kraken Device Setup Manager
 * Handles Kraken device initialization, setup, and BLE characteristic management
 */
export class KrakenDeviceSetupManager {
  constructor(globalState, connection, scanner, sendToRenderer) {
    this.globalState = globalState;
    this.connection = connection;
    this.scanner = scanner;
    this.sendToRenderer = sendToRenderer;
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
          console.log(`Setup failed for device ${deviceId} after retries, continuing with next device`);
          // Continue to next device instead of stopping the entire process
        }

        // Delay between device setups
        if (i < setupQueue.length - 1) {
          console.log(`Waiting ${KRAKEN_CONSTANTS.DELAY_BETWEEN_SETUP}ms before next device setup...`);
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
        console.warn(`Setup attempt ${attempt}/${maxRetries} failed for device ${deviceId}:`, error.message);
        Sentry.captureException(error);

        if (attempt < maxRetries) {
          // Update status to show retry will happen
          this.globalState.updateDeviceStatus(deviceId, 'in-progress', 'retrying', `Attempt ${attempt} failed, retrying...`);
        }
      }
    }

    // All retries failed
    console.error(`Setup failed for device ${deviceId} after ${maxRetries} attempts`);
    this.globalState.updateDeviceStatus(deviceId, 'failed', 'error', lastError ? lastError.message : 'Setup failed after retries');
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
      const { services, characteristics } = await discoverWithTimeout(device.peripheral, KRAKEN_CONSTANTS.DISCOVERY_TIMEOUT);

      // Update device details with fresh service discovery (including firmware)
      await this.updateKrakenDetailsFromCharacteristics(device, characteristics, deviceId);

      // Setup pressure data subscription
      await this.setupPressureSubscription(device, characteristics);

      // Store characteristics for cleanup and mark as ready
      this.globalState.setDeviceCharacteristics(deviceId, characteristics);
      this.globalState.updateDeviceStatus(deviceId, 'ready', 'complete', null, services, characteristics);
      this.sendToRenderer('device-setup-complete', { deviceId });

      return true;
    } catch (error) {
      console.error(`Error setting up device ${deviceId}:`, error);
      Sentry.captureException(error);
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

    console.log(`Device ${deviceId} is not connected (state: ${device.peripheral?.state || 'null'}), reconnecting...`);

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
      Sentry.captureException(connectError);
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
        console.warn(`Kraken characteristic read timeout after ${KRAKEN_CONSTANTS.CHARACTERISTIC_READ_TIMEOUT}ms`);
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
      const firmwareChar = characteristics.find(c => c.uuid === KRAKEN_CONSTANTS.FIRMWARE_REVISION_CHARACTERISTIC_UUID);

      if (firmwareChar) {
        let firmwareVersion = null;
        let retryCount = 0;

        // Retry firmware reading up to 3 times
        while (!firmwareVersion && retryCount < GLOBAL_CONSTANTS.MAX_RETRIES) {
          if (retryCount > 0) {
            console.log(`Device ${deviceId}: Firmware read retry ${retryCount}/${GLOBAL_CONSTANTS.MAX_RETRIES}`);
            await this.globalState.addDelay(1000); // Wait 1 second between retries
          }

          const firmwareData = await this.safeReadKrakenCharacteristic(firmwareChar);
          if (firmwareData && firmwareData.length > 0) {
            firmwareVersion = firmwareData.toString('utf8').trim();
            device.firmwareVersion = firmwareVersion;
            console.log(`Device ${deviceId}: Updated firmware version to ${firmwareVersion} on attempt ${retryCount + 1}`);
          } else {
            retryCount++;
            if (retryCount >= GLOBAL_CONSTANTS.MAX_RETRIES) {
              console.warn(`Device ${deviceId}: Could not read firmware version after ${GLOBAL_CONSTANTS.MAX_RETRIES} attempts`);
            }
          }
        }
      } else {
        console.warn(`Device ${deviceId}: Firmware characteristic not found`);
      }

      // Get display name
      const nameChar = characteristics.find(c => c.uuid === KRAKEN_CONSTANTS.DISPLAY_NAME_CHARACTERISTIC_UUID);

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

      // Get model number
      const modelChar = characteristics.find(c => c.uuid === KRAKEN_CONSTANTS.MODEL_NUMBER_CHARACTERISTIC_UUID);

      if (modelChar) {
        const modelData = await this.safeReadKrakenCharacteristic(modelChar);
        if (modelData && modelData.length > 0) {
          const modelNumber = modelData.toString('utf8').trim();
          if (modelNumber) {
            device.modelNumber = modelNumber;
            console.log(`Device ${deviceId}: Updated model number to ${modelNumber}`);
          }
        }
      }

      // Get serial number
      const serialChar = characteristics.find(c => c.uuid === KRAKEN_CONSTANTS.SERIAL_NUMBER_CHARACTERISTIC_UUID);

      if (serialChar) {
        const serialData = await this.safeReadKrakenCharacteristic(serialChar);
        if (serialData && serialData.length > 0) {
          const serialNumber = serialData.toString('utf8').trim();
          if (serialNumber) {
            device.serialNumber = serialNumber;
            console.log(`Device ${deviceId}: Updated serial number to ${serialNumber}`);
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
        modelNumber: device.modelNumber,
        serialNumber: device.serialNumber,
      });
    } catch (error) {
      console.warn(`Device ${deviceId}: Error reading device details:`, error.message);
      Sentry.captureException(error);
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
    const pressureUuid = KRAKEN_CONSTANTS.PRESSURE_CHARACTERISTIC_UUID.toLowerCase().replace(/-/g, '');
    const dataChar = characteristics.find(char => char.uuid.toLowerCase().replace(/-/g, '') === pressureUuid);

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
        const dataHandler = data => {
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

      // Store the latest pressure value for verification process
      this.globalState.setDevicePressure(deviceId, pressureValue);

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
      Sentry.captureException(error);
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
      this.globalState.updateDeviceStatus(deviceId, 'in-progress', 'retrying', 'Manual retry in progress...');
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
      Sentry.captureException(error);
      this.globalState.updateDeviceStatus(deviceId, 'failed', 'error', error.message);
      this.sendToRenderer('device-manual-retry-failed', { deviceId, error: error.message });
      return { success: false, error: error.message };
    }
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
   * Re-setup all Kraken devices after calibration (full setup like initial page load)
   */
  async reSetupKrakensAfterCalibration() {
    console.log('🔄 Re-setting up all Kraken devices for normal operation...');

    const devices = this.globalState.getConnectedDevices();
    let successCount = 0;
    let failCount = 0;

    // Reset setup state for post-calibration setup
    this.globalState.isSetupInProgress = true;
    this.globalState.currentSetupIndex = 0;

    for (const device of devices) {
      try {
        console.log(`Re-setting up device: ${device.name || device.id}`);

        // Update device status to show re-setup is in progress
        this.globalState.updateDeviceStatus(device.id, 'in-progress', 'discovering', 'Re-setting up after calibration...');
        this.sendToRenderer('device-setup-stage', {
          deviceId: device.id,
          stage: 'discovering',
          message: 'Re-discovering services and characteristics...',
        });

        // Ensure device is still connected
        if (!device.peripheral || device.peripheral.state !== 'connected') {
          throw new Error('Device is no longer connected');
        }

        // Re-discover services and characteristics (in case they changed)
        const { services, characteristics } = await discoverWithTimeout(device.peripheral, KRAKEN_CONSTANTS.DISCOVERY_TIMEOUT);

        // Update device details with fresh service discovery
        await this.updateKrakenDetailsFromCharacteristics(device, characteristics, device.id);

        // Setup pressure data subscription
        await this.setupPressureSubscription(device, characteristics);

        // Store characteristics and mark as ready
        this.globalState.setDeviceCharacteristics(device.id, characteristics);
        this.globalState.updateDeviceStatus(device.id, 'ready', 'complete', null, services, characteristics);
        this.sendToRenderer('device-setup-complete', { deviceId: device.id });

        console.log(`✅ Successfully re-setup ${device.name || device.id}`);
        successCount++;
      } catch (error) {
        console.error(`Failed to re-setup device ${device.id}:`, error.message);
        console.log(`❌ Failed to re-setup ${device.name || device.id}: ${error.message}`);
        Sentry.captureException(error);

        // Mark device as failed
        this.globalState.updateDeviceStatus(device.id, 'failed', 'error', error.message);
        this.sendToRenderer('device-setup-failed', {
          deviceId: device.id,
          error: error.message,
        });

        failCount++;
      }

      // Small delay between device setups
      if (successCount + failCount < devices.length) {
        await addDelay(1000);
      }
    }

    // Reset setup state
    this.globalState.isSetupInProgress = false;

    console.log(`📊 Device re-setup complete: ${successCount} successful, ${failCount} failed`);

    if (failCount > 0) {
      this.sendToRenderer('show-notification', {
        type: 'warning',
        message: `${failCount} device(s) failed to re-setup. Check logs for details.`,
      });
    }
  }
}
