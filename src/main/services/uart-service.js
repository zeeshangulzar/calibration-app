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

let mainWindowObj;
let deviceCalibrateLogsArr;

async function UART_service(
  mainWindow,
  deviceCalibrateLogs,
  peripheral,
  command,
  minPressure = 0,
  maxPressure = 0
) {
  mainWindowObj = mainWindow;
  deviceCalibrateLogsArr = deviceCalibrateLogs;
  let commandData;
  let rawData;
  console.log(`Executing command: ${command}`);
  await addDelay(3000);

  return new Promise(async (resolve, reject) => {
    try {
      switch (command) {
        case 'mem.localname.set':
          const newDeviceName = 'Kraken 1.5';
          commandData = { localName: newDeviceName };
          rawData = createWriteNameCommand(commandData);
          await executeSetCommand(peripheral, rawData, command);
          resolve(); // Resolve after execution
          break;

        case 'mem.localname.get':
          commandData = {};
          rawData = createReadNameCommand(commandData);
          await executeGetCommand(peripheral, rawData);
          resolve();
          break;

        case 'psi.calibrate.zero':
          commandData = {};
          rawData = createZeroOffestWriteCommand(commandData);
          await executeSetCommand(peripheral, rawData, command);
          resolve();
          break;

        case 'psi.calibrate.upper':
          const upperPressure = maxPressure;
          commandData = { measuredPressure_PSIG: upperPressure };
          rawData = createCalibMaxPressureWriteCommand(commandData);
          await executeSetCommand(peripheral, rawData, command);
          mainWindow.webContents.send(
            'calibration-logs-data',
            `Set upper pressure calibration value ${maxPressure} mPSIG`
          );
          resolve();
          break;

        case 'psi.calibrate.lower':
          const lowerPressure = minPressure;
          commandData = { measuredPressure_PSIG: lowerPressure };
          rawData = createCalibMinPressureWriteCommand(commandData);
          await executeSetCommand(peripheral, rawData, command);
          mainWindow.webContents.send(
            'calibration-logs-data',
            `Set lower pressure calibration value ${minPressure} mPSIG`
          );
          resolve();
          break;

        case 'psi.calibrate.ram.get':
          commandData = {};
          rawData = createCalibRamWriteCommand(commandData);
          await executeSetCommand(peripheral, rawData, command);
          resolve();
          break;

        case 'mem.calibrate.flash.get':
          commandData = {};
          rawData = createCalibFlashWriteCommand(commandData);
          await executeSetCommand(peripheral, rawData, command);
          resolve();
          break;

        case 'con.softreset':
          commandData = {};
          rawData = createSoftResetCommand(commandData);
          await executeSetCommand(peripheral, rawData, command);
          resolve();
          break;

        default:
          reject(new Error('Unknown command'));
          break;
      }
    } catch (error) {
      reject(error); // Reject if an error occurs
    }
  });
}

// Device Name
function createWriteNameCommand(data) {
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

function createReadNameCommand(data) {
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

function readNameResponse(data) {
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
}

// Zero Offset
function createZeroOffestWriteCommand(data) {
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

function readZeroOffsetResponse(data) {
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

  console.log('Response Zero Offest:', retData);
}

// Max Pressure
function createCalibMaxPressureWriteCommand(data) {
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

function readUpperCalibPressureResponse(rawData) {
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
function createCalibMinPressureWriteCommand(data) {
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

function readLowerCalibPressureResponse(data) {
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
function createCalibRamWriteCommand(data) {
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

function readCalibRamResponse(data) {
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
function createCalibFlashWriteCommand(data) {
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

function readCalibFlashResponse(data) {
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
function createSoftResetCommand(data) {
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

// ************************************************************** //
async function executeSetCommand(peripheral, rawData, command) {
  try {
    console.log('Finding services and characteristics... for command -->', command);
    const { services, characteristics } = await discoverWithTimeout(peripheral);
    if (!services || !characteristics) {
      console.log('No services or characteristics found');
      return reject('No services or characteristics found');
    }
    const nusService = services?.find(s => s.uuid === NUS_SERVICE_UUID);
    if (!nusService) {
      console.log('NUS service not found');
      return reject('NUS service not found');
    }
    const rxCharacteristic = characteristics?.find(
      char => char.uuid === NUS_RX_CHARACTERISTIC_UUID
    );

    if (rxCharacteristic) {
      console.log(`Raw read command data: ${rawData}`);
      const txCharacteristic = characteristics.find(
        char => char.uuid === NUS_TX_CHARACTERISTIC_UUID
      );

      return new Promise((resolve, reject) => {
        let timeout;

        txCharacteristic.subscribe(err => {
          if (err) return reject('Subscribe failed: ' + err);

          console.log('Subscribed to TX');

          // ⏱ Timeout to reject if no response
          timeout = setTimeout(() => {
            reject(
              `Timeout: No response received for '${command}' within ${
                UART_TIMEOUT_MS / 1000
              } seconds`
            );
          }, UART_TIMEOUT_MS);

          txCharacteristic.once('data', data => {
            clearTimeout(timeout); // ✅ Prevent hanging
            console.log('TX raw data:', data);
            switch (command) {
              case 'psi.calibrate.zero':
                readZeroOffsetResponse(data);
                break;
              case 'psi.calibrate.upper':
                readUpperCalibPressureResponse(data);
                break;
              case 'psi.calibrate.lower':
                readLowerCalibPressureResponse(data);
                break;
              case 'psi.calibrate.ram.get':
                let ramResponse = readCalibRamResponse(data);
                //deviceCalibrateLogsArr.push(JSON.stringify(ramResponse));
                mainWindowObj.webContents.send(
                  'calibration-logs-data',
                  JSON.stringify(ramResponse)
                );
                break;
              case 'mem.calibrate.flash.get':
                let flashResponse = readCalibFlashResponse(data);
                //deviceCalibrateLogsArr.push(JSON.stringify(flashResponse));
                mainWindowObj.webContents.send(
                  'calibration-logs-data',
                  JSON.stringify(flashResponse)
                );
                break;
              case 'con.softreset':
                break;
              default:
                break;
            }
            txCharacteristic.unsubscribe(err => {
              if (err) {
                console.error('Error unsubscribing from txCharacteristic', err);
              } else {
                console.log('Unsubscribed from txCharacteristic Updates');
              }
            });

            resolve(); // Resolve once data is processed
          });

          rxCharacteristic.write(Buffer.from(rawData), false, err => {
            if (err) {
              clearTimeout(timeout);
              return reject('Write error: ' + err);
            }
            console.log(`Rx command (${command}) write`);

            // For soft reset, no response expected
            if (command === 'con.softreset') {
              clearTimeout(timeout);
              resolve();
            }
          });
        });
      });
    } else {
      console.log('NUS RX characteristic not found');
      return reject('NUS RX characteristic not found');
    }
  } catch (error) {
    console.error('Failed to communicate with Kraken:', error);
    throw error;
  }
}

async function executeGetCommand(peripheral, rawData) {
  try {
    console.log('Finding services and characteristics...');
    const { services, characteristics } = await discoverWithTimeout(peripheral);
    if (!services || !characteristics) {
      console.log('No services or characteristics found');
      return reject('No services or characteristics found');
    }
    const nusService = services?.find(s => s.uuid === NUS_SERVICE_UUID);
    if (!nusService) {
      console.log('NUS service not found');
      return reject('NUS service not found');
    }

    const rxCharacteristic = characteristics.find(char => char.uuid === NUS_RX_CHARACTERISTIC_UUID);

    if (rxCharacteristic) {
      console.log(`Raw read command data: ${rawData}`);

      const txCharacteristic = characteristics.find(
        char => char.uuid === NUS_TX_CHARACTERISTIC_UUID
      );

      return new Promise((resolve, reject) => {
        txCharacteristic.subscribe(err => {
          if (err) return reject('Subscribe failed: ' + err);

          console.log('Subscribed to TX');
          txCharacteristic.on('data', data => {
            console.log('TX raw data:', data);
            readZeroOffsetResponse(data); // Modify as necessary for your use case
            resolve(); // Resolve when data is read
          });
          rxCharacteristic.write(Buffer.from(rawData), false, err => {
            if (err) return reject('Write error: ' + err);
            console.log('Read command sent');
          });
        });
      });
    }
  } catch (error) {
    console.error('Failed to communicate with Kraken:', error);
    throw error; // Propagate the error
  }
}

export { UART_service };
