import { addDelay } from '../../shared/helpers/calibration-helper.js';
import {
  NUS_RX_CHARACTERISTIC_UUID,
  NUS_TX_CHARACTERISTIC_UUID,
  PROPIUSCOMMS_STANDARD_PACKET_LEN,
  STANDARD_PACKET_SERVER_ID_INDEX,
  SID_PRESSURE_SENSOR,
  SID_MEMORY_MANAGER,
  CID_PRESSURE_CALIB_ZERO_OFFSET,
  CID_PRESSURE_CALIB_UPPER,
  CID_PRESSURE_CALIB_LOWER,
  CID_SET_LOCAL_BLE_NAME,
  UART_TIMEOUT_MS,
} from '../../config/constants/uart.constants.js';

import { getKrakenCalibrationState } from '../../state/kraken-calibration-state.service.js';
import { ErrorMessageService } from '../../shared/services/error-message.service.js';
import * as Sentry from '@sentry/electron/main';
/**
 * UART Service for Kraken device communication
 * Uses device characteristics from global state (no re-discovery needed)
 * Includes connectivity checking and retry functionality
 */
class UARTService {
  constructor() {
    this.timeout = UART_TIMEOUT_MS;
    this.maxRetries = 3; // Default to 3 retries
    this.retryDelay = 5000; // Default to 5 seconds delay between retries
  }

  /**
   * Check if calibration process is still active
   * @returns {boolean} true if calibration should continue
   */
  isProcessActive() {
    const state = getKrakenCalibrationState();
    return state.isCalibrationActive;
  }

  async executeCommand(device, command, minPressure = 0, maxPressure = 0, newName = '') {
    const deviceName = device.name || device.id;
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      // Check if calibration was stopped before each attempt
      if (!this.isProcessActive()) {
        return; // Stop silently
      }

      try {
        console.log(`Attempt ${attempt}/${this.maxRetries} for command: ${command}`);

        this.logAttempt(attempt, command, deviceName);
        this.validateDeviceConnection(device.id, deviceName, command);

        const { rxChar, txChar } = this.getDeviceCharacteristics(device);
        if (!rxChar || !txChar) {
          throw new Error('Device missing required UART characteristics');
        }

        const commandData = this.createCommandData(command, minPressure, maxPressure, newName);
        const rawData = this.createRawCommand(command, commandData);
        const result = await this.executeCommandWithTimeout(rxChar, txChar, rawData, command);

        console.log(`Command ${command} executed successfully on attempt ${attempt}`);
        this.showLogOnScreen(`✅ ${command} command completed successfully on ${deviceName}`);

        return { success: true, data: result, attempts: attempt };
      } catch (error) {
        lastError = error;
        Sentry.captureException(error, {
          tags: { service: 'uart-service', method: 'executeCommand' },
          extra: { command, deviceName, attempt },
        });

        // Device disconnection errors should not be retried
        if (this.isDeviceDisconnectionError(error)) {
          this.handleDeviceDisconnection(error, deviceName, command);
          throw error;
        }

        this.logFailedAttempt(attempt, command, deviceName, error);

        // Wait and check connectivity before next retry (except on last attempt)
        if (attempt < this.maxRetries) {
          // Check if calibration was stopped before waiting for retry
          if (!this.isProcessActive()) {
            return; // Stop silently
          }
          await this.handleRetryDelay(device.id, deviceName, command);
        }
      }
    }

    // All retries exhausted
    this.handleAllRetriesExhausted(command, deviceName, lastError);

    // Create specific error message based on error type
    const specificError = ErrorMessageService.createUARTErrorMessage(command, lastError, deviceName);
    throw new Error(`Command failed after ${this.maxRetries} attempts. ${specificError}`);
  }

  // Helper methods to extract and simplify logic
  logAttempt(attempt, command, deviceName) {
    if (attempt > 1) {
      this.showLogOnScreen(`🔄 Retry ${attempt}/${this.maxRetries} - ${command} command on ${deviceName}...`);
    }
  }

  validateDeviceConnection(deviceId, deviceName, command) {
    if (!this.isDeviceConnectedInGlobalState(deviceId)) {
      console.log(`Device ${deviceId} is not connected in global state, removing from calibration`);
      this.showLogOnScreen(`🔌 Device ${deviceName} disconnected, stopping ${command} command`);
      throw new Error(`DEVICE_DISCONNECTED: Device ${deviceId} is no longer connected`);
    }
  }

  isDeviceDisconnectionError(error) {
    return error.message.startsWith('DEVICE_DISCONNECTED:');
  }

  handleDeviceDisconnection(error, deviceName, command) {
    console.log(`Device disconnected, stopping retry attempts`);
    this.showLogOnScreen(`🔌 Device ${deviceName} disconnected during ${command} command`);
  }

  logFailedAttempt(attempt, command, deviceName, error) {
    console.warn(`Attempt ${attempt}/${this.maxRetries} failed for command: ${command}:`, error.message);
    this.showLogOnScreen(`⚠️ ${command} command failed on ${deviceName} (attempt ${attempt}/${this.maxRetries}): ${error.message}`);
  }

  async handleRetryDelay(deviceId, deviceName, command) {
    console.log(`Waiting ${this.retryDelay}ms before retry...`);
    this.showLogOnScreen(`⏳ Retrying ${deviceName} in ${this.retryDelay / 1000}s...`);

    await addDelay(this.retryDelay);

    // Validate connection after delay
    this.validateDeviceConnection(deviceId, deviceName, command);
  }

  handleAllRetriesExhausted(command, deviceName) {
    console.error(`Command ${command} failed after ${this.maxRetries} attempts`);
    this.showLogOnScreen(`❌ ${deviceName} - all retries failed`);
  }

  /**
   * Check if device is connected in global state
   * @param {string} deviceId - Device ID to check
   * @returns {boolean} True if device is connected
   */
  isDeviceConnectedInGlobalState(deviceId) {
    const state = getKrakenCalibrationState();
    const device = state.connectedDevices.get(deviceId);
    if (!device) {
      return false;
    }

    // Check if peripheral exists and is connected
    const isPeripheralConnected = device.peripheral && device.peripheral.state === 'connected';

    // Check if device status is ready or in-progress (not failed or disconnected)
    const deviceStatus = state.getDeviceStatus(deviceId);
    const isStatusValid = deviceStatus && !['failed', 'disconnected'].includes(deviceStatus.status);

    return isPeripheralConnected && isStatusValid;
  }

  /**
   * Show log message on screen through the main window
   * @param {string} message - Log message to display
   */
  showLogOnScreen(message) {
    const state = getKrakenCalibrationState();
    const mainWindow = state.mainWindow;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('kraken-calibration-logs-data', message);
    }
  }

  /**
   * Get UART characteristics from device (from global state)
   * @param {Object} device - Device object with characteristics from global state
   * @returns {Object} RX and TX characteristics
   */
  getDeviceCharacteristics(device) {
    let state = getKrakenCalibrationState();

    let characteristics = state.deviceCharacteristics.get(device.id);

    const rxChar = characteristics.find(c => c.uuid === NUS_RX_CHARACTERISTIC_UUID);
    const txChar = characteristics.find(c => c.uuid === NUS_TX_CHARACTERISTIC_UUID);

    if (!rxChar || !txChar) {
      throw new Error('UART characteristics not found on device');
    }

    return { rxChar, txChar };
  }

  /**
   * Create command-specific data object
   * @param {string} command - Command name
   * @param {number} minPressure - Minimum pressure
   * @param {number} maxPressure - Maximum pressure
   * @returns {Object} Command data
   */
  createCommandData(command, minPressure, maxPressure, newName = '') {
    switch (command) {
      case 'psi.calibrate.upper':
        return { measuredPressure_PSIG: maxPressure };
      case 'psi.calibrate.lower':
        return { measuredPressure_PSIG: minPressure };
      case 'ble.set.name':
        return { newName: newName };
      default:
        return {};
    }
  }

  /**
   * Create raw command buffer
   * @param {string} command - Command name
   * @param {Object} data - Command data
   * @returns {Buffer} Raw command buffer
   */
  createRawCommand(command, data) {
    switch (command) {
      case 'psi.calibrate.zero':
        return this.createZeroOffsetWriteCommand(data);
      case 'psi.calibrate.upper':
        return this.createCalibUpperPressureWriteCommand(data);
      case 'psi.calibrate.lower':
        return this.createCalibLowerPressureWriteCommand(data);
      case 'ble.set.name':
        return this.createSetBleNameCommand(data);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  async executeCommandWithTimeout(rxChar, txChar, rawData, command, timeout = this.timeout) {
    return new Promise((resolve, reject) => {
      let timeoutId;
      let isResolved = false;

      // Clean finish helper
      const finish = (success, result) => {
        if (isResolved) return;
        isResolved = true;

        if (timeoutId) clearTimeout(timeoutId);
        txChar.unsubscribe(() => {}); // Silent cleanup

        if (success) resolve(result);
        else reject(result);
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        finish(false, new Error(`Command timeout: ${command} (${timeout}ms)`));
      }, timeout);

      // Subscribe and send command
      txChar.subscribe(err => {
        if (err) return finish(false, new Error(`Subscription failed: ${err.message}`));

        console.log(`Subscribed to TX for command: ${command}`);

        // Handle response
        txChar.once('data', data => {
          try {
            const result = this.processResponse(command, data);
            finish(true, result);
          } catch (error) {
            Sentry.captureException(error, {
              tags: { service: 'uart-service', method: 'executeCommandWithTimeout' },
              extra: { command },
            });
            finish(false, error);
          }
        });

        // Send command
        rxChar.write(Buffer.from(rawData), false, err => {
          if (err) return finish(false, new Error(`Write failed: ${err.message}`));

          console.log(`Command sent: ${command}`);

          // Soft reset needs no response
          if (command === 'con.softreset') {
            finish(true, { success: true });
          }
        });
      });
    });
  }

  /**
   * Process response data based on command type
   * @param {string} command - Command name
   * @param {Buffer} data - Response data
   * @returns {Object} Processed response
   */
  processResponse(command, data) {
    switch (command) {
      case 'psi.calibrate.zero':
        return this.readZeroOffsetResponse(data);
      case 'psi.calibrate.upper':
        return this.readUpperCalibPressureResponse(data);
      case 'psi.calibrate.lower':
        return this.readLowerCalibPressureResponse(data);
      default:
        return { rawData: data };
    }
  }
  // Zero Offset
  createZeroOffsetWriteCommand() {
    let index = 0;
    const retData = new Array(PROPIUSCOMMS_STANDARD_PACKET_LEN).fill(0);

    // --- COMMAND ID ---
    retData[index] = (CID_PRESSURE_CALIB_ZERO_OFFSET >> 8) & 0xff; // Command ID high byte
    index += 1;
    retData[index] = (CID_PRESSURE_CALIB_ZERO_OFFSET >> 0) & 0xff; // Command ID low byte
    index += 1;

    // --- LENGTH ---
    retData[index] = PROPIUSCOMMS_STANDARD_PACKET_LEN; // Length of the entire packet
    index += 1;

    // --- DATA ---
    // Leave any zero's as padding (no data here)

    // --- SERVER ID ---
    retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_PRESSURE_SENSOR; // Server ID

    return retData;
  }

  readZeroOffsetResponse(data) {
    // Command ID check: Combine the first two bytes (high byte + low byte)
    const commandId = (data[0] << 8) | data[1];
    if (commandId !== CID_PRESSURE_CALIB_ZERO_OFFSET) {
      console.error('Unexpected command ID:', commandId);
      return;
    }

    // Server ID check
    const serverId = data[STANDARD_PACKET_SERVER_ID_INDEX];
    if (serverId !== SID_PRESSURE_SENSOR) {
      console.error('Unexpected server ID:', serverId);
      return;
    }

    // Extract zeroOffsetValue (UINT16)
    let index = 3; // Start after the first 3 bytes (command ID and length)
    let zeroOffsetValue = data[index];
    index += 1;
    zeroOffsetValue = (zeroOffsetValue << 8) | data[index]; // Combine the next byte to form the full 16-bit value

    // Return the result as an object
    const retData = {
      zeroOffsetValue: zeroOffsetValue, // Uint16 value
    };

    console.log('Response Zero Offset:', retData);
    return retData;
  }

  // Max Pressure
  createCalibUpperPressureWriteCommand(data) {
    const ret_data = new Array(20).fill(0);
    let index = 0;

    // --- COMMAND ID ---
    ret_data[index++] = (CID_PRESSURE_CALIB_UPPER >> 8) & 0xff;
    ret_data[index++] = (CID_PRESSURE_CALIB_UPPER >> 0) & 0xff;

    // --- LENGTH ---
    ret_data[index++] = PROPIUSCOMMS_STANDARD_PACKET_LEN;

    // --- DATA ---
    const measured = data.measuredPressure_PSIG;

    ret_data[index++] = (measured >> 24) & 0xff;
    ret_data[index++] = (measured >> 16) & 0xff;
    ret_data[index++] = (measured >> 8) & 0xff;
    ret_data[index++] = measured & 0xff;

    // --- SERVER ID ---
    ret_data[STANDARD_PACKET_SERVER_ID_INDEX] = SID_PRESSURE_SENSOR;

    return ret_data;
  }

  readUpperCalibPressureResponse(rawData) {
    const commandId = (rawData[0] << 8) | rawData[1];
    if (commandId !== CID_PRESSURE_CALIB_UPPER) {
      throw new Error(`Unexpected command ID: ${commandId} (expected ${CID_PRESSURE_CALIB_UPPER}) while reading upper calibration pressure response`);
    }

    // Validate server ID
    const serverId = rawData[STANDARD_PACKET_SERVER_ID_INDEX];
    if (serverId !== SID_PRESSURE_SENSOR) {
      throw new Error(`Unexpected server ID: ${serverId} (expected ${SID_PRESSURE_SENSOR}) while reading upper calibration pressure response`);
    }

    // Extract rawValue (UINT16, Big-Endian)
    let index = 3;
    let rawValue = (rawData[index] << 8) | rawData[index + 1];
    index += 2;

    return { rawValue };
  }

  // Min Pressure
  createCalibLowerPressureWriteCommand(data) {
    // Initialize an array of 20 elements filled with 0
    const retData = new Array(20).fill(0);
    let index = 0;

    // --- COMMAND ID ---
    retData[index] = (CID_PRESSURE_CALIB_LOWER >> 8) & 0xff; // Command ID high byte
    index += 1;
    retData[index] = (CID_PRESSURE_CALIB_LOWER >> 0) & 0xff; // Command ID low byte
    index += 1;

    // --- LENGTH ---
    retData[index] = PROPIUSCOMMS_STANDARD_PACKET_LEN; // Length of the packet
    index += 1;

    // --- DATA (measuredPressure_PSIG - INT16) ---
    const measuredPressure_PSIG = data.measuredPressure_PSIG;

    // Split the 16-bit measuredPressure_PSIG into two bytes
    retData[index] = (measuredPressure_PSIG >> 8) & 0xff; // High byte
    index += 1;
    retData[index] = measuredPressure_PSIG & 0xff; // Low byte
    index += 1;

    // --- SERVER ID ---

    retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_PRESSURE_SENSOR;

    return retData;
  }

  readLowerCalibPressureResponse(data) {
    // Command ID check: Combine the first two bytes (high byte + low byte)
    const commandId = (data[0] << 8) | data[1];
    if (commandId !== CID_PRESSURE_CALIB_LOWER) {
      console.error('Unexpected command ID:', commandId);
      return;
    }

    // Server ID check
    const serverId = data[STANDARD_PACKET_SERVER_ID_INDEX];
    if (serverId !== SID_PRESSURE_SENSOR) {
      console.error('Unexpected server ID:', serverId);
      return;
    }

    // Extract rawValue (UINT16)
    let index = 3; // Start after the first 3 bytes (command ID and length)
    let rawValue = data[index];
    console.log('RAW_VALUE', rawValue);
    index += 1;
    rawValue = (rawValue << 8) | data[index]; // Combine the next byte to form the full 16-bit value

    // Return the result as an object
    const retData = {
      rawValue: rawValue, // Uint16 value
    };

    console.log('Response Lower Pressure:', retData);
    return retData;
  }

  // Set BLE Name Command
  createSetBleNameCommand(data) {
    let index = 0;
    const retData = new Array(PROPIUSCOMMS_STANDARD_PACKET_LEN).fill(0);
    const newName = data.newName || '';

    // --- COMMAND ID ---
    retData[index] = (CID_SET_LOCAL_BLE_NAME >> 8) & 0xff; // Command ID high byte
    index += 1;
    retData[index] = (CID_SET_LOCAL_BLE_NAME >> 0) & 0xff; // Command ID low byte
    index += 1;

    // --- LENGTH ---
    retData[index] = PROPIUSCOMMS_STANDARD_PACKET_LEN; // Length of the entire packet
    index += 1;

    // --- DATA (Name as UTF-8 bytes) ---
    const nameBytes = Buffer.from(newName, 'utf8');
    const maxNameLength = PROPIUSCOMMS_STANDARD_PACKET_LEN - 4; // Reserve space for command, length, and server ID

    for (let i = 0; i < Math.min(nameBytes.length, maxNameLength); i++) {
      retData[index + i] = nameBytes[i];
    }

    // --- SERVER ID ---
    retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_MEMORY_MANAGER; // Server ID for BLE name

    return retData;
  }
}

// Export singleton instance
export const uartService = new UARTService();

// Keep backward compatibility - create a wrapper that maintains proper context
export const UART_service = (device, command, minPressure, maxPressure) => {
  return uartService.executeCommand(device, command, minPressure, maxPressure);
};
