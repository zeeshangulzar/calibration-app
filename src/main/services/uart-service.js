import { addDelay } from '../../shared/helpers/calibration-helper.js';
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

import { getKrakenCalibrationState } from '../../state/kraken-calibration-state.service.js';
/**
 * UART Service for Kraken device communication
 * Uses device characteristics from global state (no re-discovery needed)
 */
class UARTService {
  constructor() {
    this.timeout = UART_TIMEOUT_MS;
  }

  /**
   * Execute UART command using device characteristics from global state
   * @param {Object} device - Device object with characteristics from global state
   * @param {string} command - Command to execute
   * @param {number} minPressure - Minimum pressure for calibration (default: 0)
   * @param {number} maxPressure - Maximum pressure for calibration (default: 0)
   * @returns {Promise<Object>} Command execution result
   */
  async executeCommand(device, command, minPressure = 0, maxPressure = 0) {
    console.log(`Executing command: ${command} on device: ${device.id}`);

    try {
      // Validate device has required characteristics from global state
      const { rxChar, txChar } = this.getDeviceCharacteristics(device);
      if (!rxChar || !txChar) {
        throw new Error('Device missing required UART characteristics');
      }

      // Create command data
      const commandData = this.createCommandData(command, minPressure, maxPressure);
      const rawData = this.createRawCommand(command, commandData);

      // Execute command
      const result = await this.executeCommandWithTimeout(rxChar, txChar, rawData, command);

      console.log(`Command ${command} executed successfully`);
      return { success: true, data: result };
    } catch (error) {
      console.error(`Command ${command} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get UART characteristics from device (from global state)
   * @param {Object} device - Device object with characteristics from global state
   * @returns {Object} RX and TX characteristics
   */
  getDeviceCharacteristics(device) {
    // Use characteristics from global state instead of peripheral
    // if (!device.characteristics) {
    //   throw new Error('Device characteristics not available in global state');
    // }
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
  createCommandData(command, minPressure, maxPressure) {
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
   * Create raw command buffer
   * @param {string} command - Command name
   * @param {Object} data - Command data
   * @returns {Buffer} Raw command buffer
   */
  createRawCommand(command, data) {
    switch (command) {
      case 'mem.localname.set':
        return this.createWriteNameCommand(data);
      case 'mem.localname.get':
        return this.createReadNameCommand(data);
      case 'psi.calibrate.zero':
        return this.createZeroOffsetWriteCommand(data);
      case 'psi.calibrate.upper':
        return this.createCalibMaxPressureWriteCommand(data);
      case 'psi.calibrate.lower':
        return this.createCalibMinPressureWriteCommand(data);
      case 'psi.calibrate.ram.get':
        return this.createCalibRamWriteCommand(data);
      case 'mem.calibrate.flash.get':
        return this.createCalibFlashWriteCommand(data);
      case 'con.softreset':
        return this.createSoftResetCommand(data);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Execute command with proper timeout and cleanup
   * @param {Object} rxChar - RX characteristic
   * @param {Object} txChar - TX characteristic
   * @param {Buffer} rawData - Raw command data
   * @param {string} command - Command name
   * @returns {Promise<Object>} Command result
   */
  async executeCommandWithTimeout(rxChar, txChar, rawData, command) {
    return new Promise((resolve, reject) => {
      let timeoutId;
      let isResolved = false;
      let subscriptionActive = false;

      // Cleanup function
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (subscriptionActive) {
          txChar.unsubscribe(err => {
            if (err) console.warn('Unsubscribe warning:', err.message);
          });
        }
      };

      // Timeout handler
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error(`Command timeout: ${command} (${this.timeout}ms)`));
        }
      }, this.timeout);

      // Subscribe to TX characteristic
      txChar.subscribe(err => {
        if (err) {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            reject(new Error(`Subscription failed: ${err.message}`));
          }
          return;
        }

        subscriptionActive = true;
        console.log(`Subscribed to TX for command: ${command}`);

        // Handle incoming data
        const dataHandler = data => {
          if (isResolved) return;

          try {
            const result = this.processResponse(command, data);
            isResolved = true;
            cleanup();
            resolve(result);
          } catch (error) {
            isResolved = true;
            cleanup();
            reject(error);
          }
        };

        txChar.once('data', dataHandler);

        // Send command via RX characteristic
        rxChar.write(Buffer.from(rawData), false, err => {
          if (err) {
            if (!isResolved) {
              isResolved = true;
              cleanup();
              reject(new Error(`Write failed: ${err.message}`));
            }
            return;
          }

          console.log(`Command sent: ${command}`);

          // For soft reset, no response expected
          if (command === 'con.softreset') {
            isResolved = true;
            cleanup();
            resolve({ success: true });
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
      case 'psi.calibrate.ram.get':
        return this.readCalibRamResponse(data);
      case 'mem.calibrate.flash.get':
        return this.readCalibFlashResponse(data);
      case 'mem.localname.get':
        return this.readNameResponse(data);
      default:
        return { rawData: data };
    }
  }

  // Device Name
  createWriteNameCommand(data) {
    let index = 0;
    const retData = new Array(PROPIUSCOMMS_STANDARD_PACKET_LEN).fill(0);

    // --- COMMAND ID ---
    retData[index] = (CID_SET_LOCAL_BLE_NAME >> 8) & 0xff;
    index += 1;
    retData[index] = (CID_SET_LOCAL_BLE_NAME >> 0) & 0xff;
    index += 1;

    // --- LENGTH ---
    retData[index] = PROPIUSCOMMS_STANDARD_PACKET_LEN;
    index += 1;

    // --- DATA (localName, STR16) ---
    const charArray = Array.from(data.localName);
    charArray.forEach(c => {
      retData[index] = c.charCodeAt(0);
      index += 1;
    });

    // --- SERVER ID ---
    retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_MEMORY_MANAGER;

    return retData;
  }

  createReadNameCommand(data) {
    let index = 0;
    const retData = new Array(PROPIUSCOMMS_STANDARD_PACKET_LEN).fill(0);

    // --- COMMAND ID ---
    retData[index] = (CID_GET_LOCAL_BLE_NAME >> 8) & 0xff; // Command ID high byte
    index += 1;
    retData[index] = (CID_GET_LOCAL_BLE_NAME >> 0) & 0xff; // Command ID low byte
    index += 1;

    // --- LENGTH ---
    retData[index] = PROPIUSCOMMS_STANDARD_PACKET_LEN; // Length of the entire packet
    index += 1;

    // --- DATA ---
    // Leave any zero's as padding (no data here)

    // --- SERVER ID ---
    retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_MEMORY_MANAGER; // Server ID

    return retData;
  }

  readNameResponse(data) {
    // Find the start of the name (typically after the command ID and length bytes)
    const nameStart = 3; // The name starts after the first 3 bytes (command ID and length)
    // Find the end of the name (the first 0x00 byte represents the end of the name)
    let nameEnd = nameStart;
    while (data[nameEnd] !== 0x00 && nameEnd < data.length) {
      nameEnd++;
    }
    // Extract the part of the buffer that represents the human-readable string
    const name = data.slice(nameStart, nameEnd).toString('utf8').trim(); // Start from byte 3 to byte 13 (ignoring the header and padding)
    console.log('Read Kraken Name:', name);
    return { name };
  }

  // Zero Offset
  createZeroOffsetWriteCommand(data) {
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
  createCalibMaxPressureWriteCommand(data) {
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
      throw new Error(
        `Unexpected command ID: ${commandId} (expected ${CID_PRESSURE_CALIB_UPPER}) while reading upper calibration pressure response`
      );
    }

    // Validate server ID
    const serverId = rawData[STANDARD_PACKET_SERVER_ID_INDEX];
    if (serverId !== SID_PRESSURE_SENSOR) {
      throw new Error(
        `Unexpected server ID: ${serverId} (expected ${SID_PRESSURE_SENSOR}) while reading upper calibration pressure response`
      );
    }

    // Extract rawValue (UINT16, Big-Endian)
    let index = 3;
    let rawValue = (rawData[index] << 8) | rawData[index + 1];
    index += 2;

    return { rawValue };
  }

  // Min Pressure
  createCalibMinPressureWriteCommand(data) {
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

  // Get Calibration Ram Data
  createCalibRamWriteCommand(data) {
    // Initialize an array of 20 elements filled with 0
    const retData = new Array(20).fill(0);
    let index = 0;

    // --- COMMAND ID ---
    retData[index] = (CID_PRESSURE_GET_CALIB_RAM >> 8) & 0xff; // Command ID high byte
    index += 1;
    retData[index] = (CID_PRESSURE_GET_CALIB_RAM >> 0) & 0xff; // Command ID low byte
    index += 1;

    // --- LENGTH ---
    retData[index] = PROPIUSCOMMS_STANDARD_PACKET_LEN; // Length of the packet
    index += 1;

    // --- DATA ---
    // Leave any zero's as padding (there is no actual data)

    // --- SERVER ID ---
    retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_PRESSURE_SENSOR; // Server ID

    return retData;
  }

  readCalibRamResponse(data) {
    // Command ID check: Combine the first two bytes (high byte + low byte)
    const commandId = (data[0] << 8) | data[1];
    if (commandId !== CID_PRESSURE_GET_CALIB_RAM) {
      console.error('Unexpected command ID:', commandId);
      return;
    }

    // Server ID check
    const serverId = data[STANDARD_PACKET_SERVER_ID_INDEX];
    if (serverId !== SID_PRESSURE_SENSOR) {
      console.error('Unexpected server ID:', serverId);
      return;
    }

    let index = 3;
    const retData = {};

    // Extract upper_pressure_value_mPSIG (INT32)
    retData['upper_pressure_value_mPSIG'] =
      (data[index] << 24) | (data[index + 1] << 16) | (data[index + 2] << 8) | data[index + 3];
    index += 4;
    retData['upper_pressure_value_mPSIG'] = (retData['upper_pressure_value_mPSIG'] << 0) >> 0; // To mimic np.int32

    // Extract upper_pressure_rawValue (UINT16)
    retData['upper_pressure_rawValue'] = (data[index] << 8) | data[index + 1];
    index += 2;
    retData['upper_pressure_rawValue'] = retData['upper_pressure_rawValue'] >>> 0; // To mimic np.uint16

    // Extract lower_pressure_value_mPSIG (INT32)
    retData['lower_pressure_value_mPSIG'] =
      (data[index] << 24) | (data[index + 1] << 16) | (data[index + 2] << 8) | data[index + 3];
    index += 4;
    retData['lower_pressure_value_mPSIG'] = (retData['lower_pressure_value_mPSIG'] << 0) >> 0; // To mimic np.int32

    // Extract lower_pressure_rawValue (UINT16)
    retData['lower_pressure_rawValue'] = (data[index] << 8) | data[index + 1];
    index += 2;
    retData['lower_pressure_rawValue'] = retData['lower_pressure_rawValue'] >>> 0; // To mimic np.uint16

    // Extract zeroOffsetValue (UINT16)
    retData['zeroOffsetValue'] = (data[index] << 8) | data[index + 1];
    index += 2;
    retData['zeroOffsetValue'] = retData['zeroOffsetValue'] >>> 0; // To mimic np.uint16

    console.log('Response Calib Ram:', retData);
    return retData;
  }

  // Get Calibration Flash Data
  createCalibFlashWriteCommand(data) {
    // Initialize an array of 20 elements filled with 0
    const retData = new Array(20).fill(0);
    let index = 0;

    // --- COMMAND ID ---
    retData[index] = (CID_PRESSURE_GET_CALIB_FLASH >> 8) & 0xff; // Command ID high byte
    index += 1;
    retData[index] = (CID_PRESSURE_GET_CALIB_FLASH >> 0) & 0xff; // Command ID low byte
    index += 1;

    // --- LENGTH ---
    retData[index] = PROPIUSCOMMS_STANDARD_PACKET_LEN; // Length of the packet
    index += 1;

    // --- DATA ---
    // Leave any zero's as padding (there is no actual data)

    // --- SERVER ID ---
    retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_MEMORY_MANAGER; // Server ID

    return retData;
  }

  readCalibFlashResponse(data) {
    // Command ID check: Combine the first two bytes (high byte + low byte)
    const commandId = (data[0] << 8) | data[1];
    if (commandId !== CID_PRESSURE_GET_CALIB_FLASH) {
      console.error('Unexpected command ID:', commandId);
      return;
    }

    // Server ID check
    const serverId = data[STANDARD_PACKET_SERVER_ID_INDEX];
    if (serverId !== SID_MEMORY_MANAGER) {
      console.error('Unexpected server ID:', serverId);
      return;
    }

    let index = 3;
    const retData = {};

    // Extract upper_pressure_value_mPSIG (INT32)
    retData['upper_pressure_value_mPSIG'] =
      (data[index] << 24) | (data[index + 1] << 16) | (data[index + 2] << 8) | data[index + 3];
    index += 4;
    retData['upper_pressure_value_mPSIG'] = retData['upper_pressure_value_mPSIG'] >> 0; // To mimic np.int32 (sign extension)

    // Extract upper_pressure_rawValue (UINT16)
    retData['upper_pressure_rawValue'] = (data[index] << 8) | data[index + 1];
    index += 2;
    retData['upper_pressure_rawValue'] = retData['upper_pressure_rawValue'] >>> 0; // To mimic np.uint16

    // Extract lower_pressure_value_mPSIG (INT32)
    retData['lower_pressure_value_mPSIG'] =
      (data[index] << 24) | (data[index + 1] << 16) | (data[index + 2] << 8) | data[index + 3];
    index += 4;
    retData['lower_pressure_value_mPSIG'] = retData['lower_pressure_value_mPSIG'] >> 0; // To mimic np.int32 (sign extension)

    // Extract lower_pressure_rawValue (UINT16)
    retData['lower_pressure_rawValue'] = (data[index] << 8) | data[index + 1];
    index += 2;
    retData['lower_pressure_rawValue'] = retData['lower_pressure_rawValue'] >>> 0; // To mimic np.uint16

    // Extract zeroOffsetValue (UINT16)
    retData['zeroOffsetValue'] = (data[index] << 8) | data[index + 1];
    index += 2;
    retData['zeroOffsetValue'] = retData['zeroOffsetValue'] >>> 0; // To mimic np.uint16

    console.log('Response Calib Flash:', retData);
    return retData;
  }

  // Soft Reset Device
  createSoftResetCommand(data) {
    const retData = new Array(20).fill(0);
    let index = 0;

    // --- COMMAND ID ---
    retData[index] = (CID_SOFTWARE_RESET >> 8) & 0xff; // Command ID high byte
    index += 1;
    retData[index] = (CID_SOFTWARE_RESET >> 0) & 0xff; // Command ID low byte
    index += 1;

    // --- LENGTH ---
    retData[index] = PROPIUSCOMMS_STANDARD_PACKET_LEN; // Length of the packet
    index += 1;

    // --- DATA ---
    // Leave any zero's as padding (there is no actual data)

    // --- SERVER ID ---
    retData[STANDARD_PACKET_SERVER_ID_INDEX] = SID_CONTROL; // Server ID

    return retData;
  }
}

// Export singleton instance
export const uartService = new UARTService();

// Keep backward compatibility
export const UART_service = uartService.executeCommand.bind(uartService);
