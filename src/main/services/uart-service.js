import { discoverWithTimeout } from '../utils/ble_helper.js';
import { addDelay } from '../utils/helper.js';
import {
  NUS_SERVICE_UUID,
  NUS_RX_CHARACTERISTIC_UUID,
  NUS_TX_CHARACTERISTIC_UUID,
  PROPIUSCOMMS_STANDARD_PACKET_LEN,
  STANDARD_PACKET_SERVER_ID_INDEX,
  SID_MEMORY_MANAGER,
  SID_PRESSURE_SENSOR,
  SID_CONTROL,
  CID_SET_LOCAL_BLE_NAME,
  CID_GET_LOCAL_BLE_NAME,
  CID_PRESSURE_CALIB_ZERO_OFFSET,
  CID_PRESSURE_CALIB_UPPER,
  CID_PRESSURE_CALIB_LOWER,
  CID_PRESSURE_GET_CALIB_RAM,
  CID_PRESSURE_GET_CALIB_FLASH,
  CID_SOFTWARE_RESET,
  UART_TIMEOUT_MS,
} from '../../config/constants/uart.constants.js';

/**
 * UART Service Configuration
 */
const CONFIG = {
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  INITIAL_DELAY_MS: 3000,
  COMMAND_TIMEOUT_MS: UART_TIMEOUT_MS || 10000,
  BACKOFF_MULTIPLIER: 1.5,
};

/**
 * Custom error classes for better error handling
 */
class UARTError extends Error {
  constructor(message, code, retryable = true) {
    super(message);
    this.name = 'UARTError';
    this.code = code;
    this.retryable = retryable;
  }
}

class UARTTimeoutError extends UARTError {
  constructor(command, timeoutMs) {
    super(`Command '${command}' timed out after ${timeoutMs}ms`, 'TIMEOUT');
  }
}

class UARTValidationError extends UARTError {
  constructor(message) {
    super(message, 'VALIDATION', false);
  }
}

/**
 * Command registry for better organization
 */
const COMMAND_REGISTRY = {
  'mem.localname.set': {
    createCommand: createWriteNameCommand,
    responseHandler: null,
    requiresResponse: true,
    serverId: SID_MEMORY_MANAGER,
  },
  'mem.localname.get': {
    createCommand: createReadNameCommand,
    responseHandler: readNameResponse,
    requiresResponse: true,
    serverId: SID_MEMORY_MANAGER,
  },
  'psi.calibrate.zero': {
    createCommand: createZeroOffestWriteCommand,
    responseHandler: readZeroOffsetResponse,
    requiresResponse: true,
    serverId: SID_PRESSURE_SENSOR,
  },
  'psi.calibrate.upper': {
    createCommand: createCalibMaxPressureWriteCommand,
    responseHandler: readUpperCalibPressureResponse,
    requiresResponse: true,
    serverId: SID_PRESSURE_SENSOR,
  },
  'psi.calibrate.lower': {
    createCommand: createCalibMinPressureWriteCommand,
    responseHandler: readLowerCalibPressureResponse,
    requiresResponse: true,
    serverId: SID_PRESSURE_SENSOR,
  },
  'psi.calibrate.ram.get': {
    createCommand: createCalibRamWriteCommand,
    responseHandler: readCalibRamResponse,
    requiresResponse: true,
    serverId: SID_PRESSURE_SENSOR,
  },
  'mem.calibrate.flash.get': {
    createCommand: createCalibFlashWriteCommand,
    responseHandler: readCalibFlashResponse,
    requiresResponse: true,
    serverId: SID_MEMORY_MANAGER,
  },
  'con.softreset': {
    createCommand: createSoftResetCommand,
    responseHandler: null,
    requiresResponse: false,
    serverId: SID_CONTROL,
  },
};

/**
 * Main UART Service Class
 */
class UARTService {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.deviceCalibrateLogs = [];
    this.isConnected = false;
  }

  /**
   * Execute a command with retry mechanism
   */
  async executeCommand(peripheral, command, options = {}) {
    const { minPressure = 0, maxPressure = 0, retryAttempts = CONFIG.MAX_RETRY_ATTEMPTS } = options;

    if (!COMMAND_REGISTRY[command]) {
      throw new UARTValidationError(`Unknown command: ${command}`);
    }

    console.log(`Executing command: ${command}`);
    await addDelay(CONFIG.INITIAL_DELAY_MS);

    return this.executeWithRetry(
      () => this._executeCommandInternal(peripheral, command, { minPressure, maxPressure }),
      retryAttempts,
      command
    );
  }

  /**
   * Internal command execution logic
   */
  async _executeCommandInternal(peripheral, command, { minPressure, maxPressure }) {
    const commandConfig = COMMAND_REGISTRY[command];
    const commandData = this._prepareCommandData(command, { minPressure, maxPressure });
    const rawData = commandConfig.createCommand(commandData);

    return this._communicateWithDevice(peripheral, command, rawData, commandConfig);
  }

  /**
   * Prepare command data based on command type
   */
  _prepareCommandData(command, { minPressure, maxPressure }) {
    switch (command) {
      case 'mem.localname.set':
        return { localName: 'Kraken 1.5' };
      case 'psi.calibrate.upper':
        return { measuredPressure_PSIG: maxPressure };
      case 'psi.calibrate.lower':
        return { measuredPressure_PSIG: minPressure };
      default:
        return {};
    }
  }

  /**
   * Execute function with retry mechanism and exponential backoff
   */
  async executeWithRetry(fn, maxAttempts, context = '') {
    let lastError;
    let delay = CONFIG.RETRY_DELAY_MS;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxAttempts} for ${context}`);
        return await fn();
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt} failed for ${context}:`, error.message);

        // Don't retry non-retryable errors
        if (error instanceof UARTError && !error.retryable) {
          throw error;
        }

        // If this was the last attempt, throw the error
        if (attempt === maxAttempts) {
          break;
        }

        // Wait before retrying with exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await addDelay(delay);
        delay *= CONFIG.BACKOFF_MULTIPLIER;
      }
    }

    throw new UARTError(
      `Command failed after ${maxAttempts} attempts. Last error: ${lastError.message}`,
      'MAX_RETRIES_EXCEEDED'
    );
  }

  /**
   * Handle BLE communication with device
   */
  async _communicateWithDevice(peripheral, command, rawData, commandConfig) {
    const { services, characteristics } = await this._discoverServices(peripheral);
    const { rxCharacteristic, txCharacteristic } = await this._getCharacteristics(
      services,
      characteristics
    );

    if (!commandConfig.requiresResponse) {
      return this._writeCommand(rxCharacteristic, rawData, command);
    }

    return this._writeCommandWithResponse(
      rxCharacteristic,
      txCharacteristic,
      rawData,
      command,
      commandConfig
    );
  }

  /**
   * Discover BLE services with validation
   */
  async _discoverServices(peripheral) {
    try {
      const { services, characteristics } = await discoverWithTimeout(peripheral);

      if (!services || !characteristics) {
        throw new UARTError('No services or characteristics found', 'DISCOVERY_FAILED');
      }

      return { services, characteristics };
    } catch (error) {
      throw new UARTError(`Service discovery failed: ${error.message}`, 'DISCOVERY_FAILED');
    }
  }

  /**
   * Get required BLE characteristics
   */
  async _getCharacteristics(services, characteristics) {
    const nusService = services.find(s => s.uuid === NUS_SERVICE_UUID);
    if (!nusService) {
      throw new UARTError('NUS service not found', 'SERVICE_NOT_FOUND');
    }

    const rxCharacteristic = characteristics.find(char => char.uuid === NUS_RX_CHARACTERISTIC_UUID);
    const txCharacteristic = characteristics.find(char => char.uuid === NUS_TX_CHARACTERISTIC_UUID);

    if (!rxCharacteristic) {
      throw new UARTError('RX characteristic not found', 'CHARACTERISTIC_NOT_FOUND');
    }

    if (!txCharacteristic) {
      throw new UARTError('TX characteristic not found', 'CHARACTERISTIC_NOT_FOUND');
    }

    return { rxCharacteristic, txCharacteristic };
  }

  /**
   * Write command without expecting response
   */
  async _writeCommand(rxCharacteristic, rawData, command) {
    return new Promise((resolve, reject) => {
      rxCharacteristic.write(Buffer.from(rawData), false, err => {
        if (err) {
          reject(new UARTError(`Write error for command '${command}': ${err}`, 'WRITE_FAILED'));
        } else {
          console.log(`Command '${command}' written successfully`);
          resolve();
        }
      });
    });
  }

  /**
   * Write command and wait for response
   */
  async _writeCommandWithResponse(
    rxCharacteristic,
    txCharacteristic,
    rawData,
    command,
    commandConfig
  ) {
    return new Promise((resolve, reject) => {
      let timeout;
      let isResolved = false;

      const cleanup = error => {
        if (isResolved) return;
        isResolved = true;

        if (timeout) clearTimeout(timeout);

        txCharacteristic.unsubscribe(err => {
          if (err) console.warn('Error unsubscribing from txCharacteristic:', err);
        });

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      // Set up timeout
      timeout = setTimeout(() => {
        cleanup(new UARTTimeoutError(command, CONFIG.COMMAND_TIMEOUT_MS));
      }, CONFIG.COMMAND_TIMEOUT_MS);

      // Subscribe to responses
      txCharacteristic.subscribe(err => {
        if (err) {
          return cleanup(new UARTError(`Subscribe failed: ${err}`, 'SUBSCRIBE_FAILED'));
        }

        console.log(`Subscribed to TX for command: ${command}`);

        txCharacteristic.once('data', data => {
          try {
            console.log(`Received response for '${command}':`, data);
            const response = this._processResponse(data, command, commandConfig);
            cleanup();
          } catch (error) {
            cleanup(
              new UARTError(`Response processing failed: ${error.message}`, 'RESPONSE_FAILED')
            );
          }
        });

        // Write the command
        rxCharacteristic.write(Buffer.from(rawData), false, err => {
          if (err) {
            cleanup(new UARTError(`Write error for command '${command}': ${err}`, 'WRITE_FAILED'));
          } else {
            console.log(`Command '${command}' written, awaiting response`);
          }
        });
      });
    });
  }

  /**
   * Process device response based on command type
   */
  _processResponse(data, command, commandConfig) {
    if (!commandConfig.responseHandler) {
      return null;
    }

    const response = commandConfig.responseHandler(data);

    // Handle specific command responses
    switch (command) {
      case 'psi.calibrate.upper':
        this._sendCalibrationLog(`Set upper pressure calibration value`);
        break;
      case 'psi.calibrate.lower':
        this._sendCalibrationLog(`Set lower pressure calibration value`);
        break;
      case 'psi.calibrate.ram.get':
      case 'mem.calibrate.flash.get':
        this._sendCalibrationLog(JSON.stringify(response));
        break;
    }

    return response;
  }

  /**
   * Send calibration log to main window
   */
  _sendCalibrationLog(message) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send('calibration-logs-data', message);
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * Set connection status
   */
  setConnectionStatus(status) {
    this.isConnected = status;
  }
}

// Command creation functions (unchanged from original)
function createWriteNameCommand(data) {
  let index = 0;
  const retData = new Array(PROPIUSCOMMS_STANDARD_PACKET_LEN).fill(0);

  retData[index++] = (CID_SET_LOCAL_BLE_NAME >> 8) & 0xff;
  retData[index++] = (CID_SET_LOCAL_BLE_NAME >> 0) & 0xff;
  retData[index++] = PROPIUSCOMMS_STANDARD_PACKET_LEN;

  const charArray = Array.from(data.localName);
  charArray.forEach(c => {
    retData[index++] = c.charCodeAt(0);
  });

  retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_MEMORY_MANAGER;
  return retData;
}

function createReadNameCommand(data) {
  let index = 0;
  const retData = new Array(PROPIUSCOMMS_STANDARD_PACKET_LEN).fill(0);

  retData[index++] = (CID_GET_LOCAL_BLE_NAME >> 8) & 0xff;
  retData[index++] = (CID_GET_LOCAL_BLE_NAME >> 0) & 0xff;
  retData[index++] = PROPIUSCOMMS_STANDARD_PACKET_LEN;
  retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_MEMORY_MANAGER;

  return retData;
}

function readNameResponse(data) {
  const nameStart = 3;
  let nameEnd = nameStart;
  while (data[nameEnd] !== 0x00 && nameEnd < data.length) {
    nameEnd++;
  }
  const name = data.slice(nameStart, nameEnd).toString('utf8').trim();
  console.log('Read Kraken Name:', name);
  return { name };
}

function createZeroOffestWriteCommand(data) {
  let index = 0;
  const retData = new Array(PROPIUSCOMMS_STANDARD_PACKET_LEN).fill(0);

  retData[index++] = (CID_PRESSURE_CALIB_ZERO_OFFSET >> 8) & 0xff;
  retData[index++] = (CID_PRESSURE_CALIB_ZERO_OFFSET >> 0) & 0xff;
  retData[index++] = PROPIUSCOMMS_STANDARD_PACKET_LEN;
  retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_PRESSURE_SENSOR;

  return retData;
}

function readZeroOffsetResponse(data) {
  const commandId = (data[0] << 8) | data[1];
  if (commandId !== CID_PRESSURE_CALIB_ZERO_OFFSET) {
    throw new UARTValidationError(`Unexpected command ID: ${commandId}`);
  }

  const serverId = data[STANDARD_PACKET_SERVER_ID_INDEX];
  if (serverId !== SID_PRESSURE_SENSOR) {
    throw new UARTValidationError(`Unexpected server ID: ${serverId}`);
  }

  let index = 3;
  let zeroOffsetValue = data[index];
  index += 1;
  zeroOffsetValue = (zeroOffsetValue << 8) | data[index];

  const retData = { zeroOffsetValue };
  console.log('Response Zero Offset:', retData);
  return retData;
}

function createCalibMaxPressureWriteCommand(data) {
  const retData = new Array(20).fill(0);
  let index = 0;

  retData[index++] = (CID_PRESSURE_CALIB_UPPER >> 8) & 0xff;
  retData[index++] = (CID_PRESSURE_CALIB_UPPER >> 0) & 0xff;
  retData[index++] = PROPIUSCOMMS_STANDARD_PACKET_LEN;

  const measured = data.measuredPressure_PSIG;
  retData[index++] = (measured >> 24) & 0xff;
  retData[index++] = (measured >> 16) & 0xff;
  retData[index++] = (measured >> 8) & 0xff;
  retData[index++] = measured & 0xff;

  retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_PRESSURE_SENSOR;
  return retData;
}

function readUpperCalibPressureResponse(rawData) {
  const commandId = (rawData[0] << 8) | rawData[1];
  if (commandId !== CID_PRESSURE_CALIB_UPPER) {
    throw new UARTValidationError(
      `Unexpected command ID: ${commandId} (expected ${CID_PRESSURE_CALIB_UPPER})`
    );
  }

  const serverId = rawData[STANDARD_PACKET_SERVER_ID_INDEX];
  if (serverId !== SID_PRESSURE_SENSOR) {
    throw new UARTValidationError(
      `Unexpected server ID: ${serverId} (expected ${SID_PRESSURE_SENSOR})`
    );
  }

  let index = 3;
  let rawValue = (rawData[index] << 8) | rawData[index + 1];

  return { rawValue };
}

function createCalibMinPressureWriteCommand(data) {
  const retData = new Array(20).fill(0);
  let index = 0;

  retData[index++] = (CID_PRESSURE_CALIB_LOWER >> 8) & 0xff;
  retData[index++] = (CID_PRESSURE_CALIB_LOWER >> 0) & 0xff;
  retData[index++] = PROPIUSCOMMS_STANDARD_PACKET_LEN;

  const measuredPressure_PSIG = data.measuredPressure_PSIG;
  retData[index++] = (measuredPressure_PSIG >> 8) & 0xff;
  retData[index++] = measuredPressure_PSIG & 0xff;

  retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_PRESSURE_SENSOR;
  return retData;
}

function readLowerCalibPressureResponse(data) {
  const commandId = (data[0] << 8) | data[1];
  if (commandId !== CID_PRESSURE_CALIB_LOWER) {
    throw new UARTValidationError(`Unexpected command ID: ${commandId}`);
  }

  const serverId = data[STANDARD_PACKET_SERVER_ID_INDEX];
  if (serverId !== SID_PRESSURE_SENSOR) {
    throw new UARTValidationError(`Unexpected server ID: ${serverId}`);
  }

  let index = 3;
  let rawValue = data[index];
  index += 1;
  rawValue = (rawValue << 8) | data[index];

  const retData = { rawValue };
  console.log('Response Lower Pressure:', retData);
  return retData;
}

function createCalibRamWriteCommand(data) {
  const retData = new Array(20).fill(0);
  let index = 0;

  retData[index++] = (CID_PRESSURE_GET_CALIB_RAM >> 8) & 0xff;
  retData[index++] = (CID_PRESSURE_GET_CALIB_RAM >> 0) & 0xff;
  retData[index++] = PROPIUSCOMMS_STANDARD_PACKET_LEN;
  retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_PRESSURE_SENSOR;

  return retData;
}

function readCalibRamResponse(data) {
  const commandId = (data[0] << 8) | data[1];
  if (commandId !== CID_PRESSURE_GET_CALIB_RAM) {
    throw new UARTValidationError(`Unexpected command ID: ${commandId}`);
  }

  const serverId = data[STANDARD_PACKET_SERVER_ID_INDEX];
  if (serverId !== SID_PRESSURE_SENSOR) {
    throw new UARTValidationError(`Unexpected server ID: ${serverId}`);
  }

  let index = 3;
  const retData = {};

  retData['upper_pressure_value_mPSIG'] =
    (data[index] << 24) | (data[index + 1] << 16) | (data[index + 2] << 8) | data[index + 3];
  index += 4;
  retData['upper_pressure_value_mPSIG'] = (retData['upper_pressure_value_mPSIG'] << 0) >> 0;

  retData['upper_pressure_rawValue'] = (data[index] << 8) | data[index + 1];
  index += 2;
  retData['upper_pressure_rawValue'] = retData['upper_pressure_rawValue'] >>> 0;

  retData['lower_pressure_value_mPSIG'] =
    (data[index] << 24) | (data[index + 1] << 16) | (data[index + 2] << 8) | data[index + 3];
  index += 4;
  retData['lower_pressure_value_mPSIG'] = (retData['lower_pressure_value_mPSIG'] << 0) >> 0;

  retData['lower_pressure_rawValue'] = (data[index] << 8) | data[index + 1];
  index += 2;
  retData['lower_pressure_rawValue'] = retData['lower_pressure_rawValue'] >>> 0;

  retData['zeroOffsetValue'] = (data[index] << 8) | data[index + 1];
  index += 2;
  retData['zeroOffsetValue'] = retData['zeroOffsetValue'] >>> 0;

  console.log('Response Calib Ram:', retData);
  return retData;
}

function createCalibFlashWriteCommand(data) {
  const retData = new Array(20).fill(0);
  let index = 0;

  retData[index++] = (CID_PRESSURE_GET_CALIB_FLASH >> 8) & 0xff;
  retData[index++] = (CID_PRESSURE_GET_CALIB_FLASH >> 0) & 0xff;
  retData[index++] = PROPIUSCOMMS_STANDARD_PACKET_LEN;
  retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_MEMORY_MANAGER;

  return retData;
}

function readCalibFlashResponse(data) {
  const commandId = (data[0] << 8) | data[1];
  if (commandId !== CID_PRESSURE_GET_CALIB_FLASH) {
    throw new UARTValidationError(`Unexpected command ID: ${commandId}`);
  }

  const serverId = data[STANDARD_PACKET_SERVER_ID_INDEX];
  if (serverId !== SID_MEMORY_MANAGER) {
    throw new UARTValidationError(`Unexpected server ID: ${serverId}`);
  }

  let index = 3;
  const retData = {};

  retData['upper_pressure_value_mPSIG'] =
    (data[index] << 24) | (data[index + 1] << 16) | (data[index + 2] << 8) | data[index + 3];
  index += 4;
  retData['upper_pressure_value_mPSIG'] = retData['upper_pressure_value_mPSIG'] >> 0;

  retData['upper_pressure_rawValue'] = (data[index] << 8) | data[index + 1];
  index += 2;
  retData['upper_pressure_rawValue'] = retData['upper_pressure_rawValue'] >>> 0;

  retData['lower_pressure_value_mPSIG'] =
    (data[index] << 24) | (data[index + 1] << 16) | (data[index + 2] << 8) | data[index + 3];
  index += 4;
  retData['lower_pressure_value_mPSIG'] = retData['lower_pressure_value_mPSIG'] >> 0;

  retData['lower_pressure_rawValue'] = (data[index] << 8) | data[index + 1];
  index += 2;
  retData['lower_pressure_rawValue'] = retData['lower_pressure_rawValue'] >>> 0;

  retData['zeroOffsetValue'] = (data[index] << 8) | data[index + 1];
  index += 2;
  retData['zeroOffsetValue'] = retData['zeroOffsetValue'] >>> 0;

  console.log('Response Calib Flash:', retData);
  return retData;
}

function createSoftResetCommand(data) {
  const retData = new Array(20).fill(0);
  let index = 0;

  retData[index++] = (CID_SOFTWARE_RESET >> 8) & 0xff;
  retData[index++] = (CID_SOFTWARE_RESET >> 0) & 0xff;
  retData[index++] = PROPIUSCOMMS_STANDARD_PACKET_LEN;
  retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_CONTROL;

  return retData;
}

// Export both the class and a legacy function for backward compatibility
export { UARTService };

// Legacy function wrapper for backward compatibility
export async function UART_service(
  mainWindow,
  deviceCalibrateLogs,
  peripheral,
  command,
  minPressure = 0,
  maxPressure = 0
) {
  const uartService = new UARTService(mainWindow);
  return uartService.executeCommand(peripheral, command, { minPressure, maxPressure });
}
