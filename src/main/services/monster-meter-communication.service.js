import EventEmitter from 'events';
import { MONSTER_METER_CONSTANTS } from '../../config/constants/monster-meter.constants.js';
import { addDelay } from '../../shared/helpers/calibration-helper.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Monster Meter Communication Service - Handles low-level communication with Monster Meter devices
 */
class MonsterMeterCommunicationService extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.isReading = false;
  }

  setPort(port) {
    this.port = port;
  }

  async sendCommand(commandByte) {
    if (!this.port?.isOpen) {
      throw new Error('Serial port not available or not open');
    }

    try {
      const buffer = Buffer.alloc(MONSTER_METER_CONSTANTS.COMMAND_BUFFER_SIZE);
      buffer.writeUInt8(commandByte, 0);

      await new Promise((resolve, reject) => {
        this.port.write(buffer, error => (error ? reject(error) : this.port.drain(resolve)));
      });

      console.log(`Command 0x${commandByte.toString(16)} sent successfully`);
    } catch (error) {
      this.handleError('sendCommand', error, { commandByte });
      throw error;
    }
  }

  async writeBuffer(buffer) {
    if (!this.port?.isOpen) {
      throw new Error('Serial port not available or not open');
    }

    try {
      await new Promise((resolve, reject) => {
        // Set DTR to false and flush before writing
        this.port.set({ dtr: false }, () => {
          this.port.flush(() => {
            this.port.write(buffer, err => {
              if (err) {
                console.log('Buffer writing failed: ', err.message);
                return reject(err);
              }
              resolve();
            });
          });
        });
      });

      console.log(`Buffer of ${buffer.length} bytes written successfully`);
    } catch (error) {
      this.handleError('writeBuffer', error, { bufferLength: buffer.length });
      throw error;
    }
  }

  async readData(maxAttempts = MONSTER_METER_CONSTANTS.MAX_RETRIES) {
    if (!this.port?.isOpen) {
      throw new Error('Serial port not available or not open');
    }

    return new Promise((resolve, reject) => {
      let attempts = 0;
      let responseBuffer = Buffer.alloc(0);

      const tryRead = () => {
        if (attempts++ >= maxAttempts) {
          const error = new Error('Monster Meter not responding after multiple attempts');
          console.log('[Communication] Monster Meter not responding after multiple attempts');
          this.emit('dataError', error);
          return reject(error);
        }

        responseBuffer = Buffer.alloc(0);

        if (attempts > 1) {
          console.log(`[Communication] Attempt ${attempts}: Sending GET_DATA command...`);
        }

        const request = Buffer.concat([Buffer.from([MONSTER_METER_CONSTANTS.COMMANDS.GET_DATA]), Buffer.alloc(35, 0)]);

        this.port.write(request, error => {
          if (error) {
            console.error('[Communication] GET_DATA command failed:', error.message);
            reject(error);
          }
        });

        const handleData = chunk => {
          clearTimeout(timeout);
          responseBuffer = Buffer.concat([responseBuffer, chunk]);

          const { length } = responseBuffer;
          console.log(`[Communication] Received ${chunk.length} bytes, total: ${length}/100 expected`);
          console.log(`[Communication] Latest chunk:`, this.formatBytes(chunk));

          if (length >= 100) {
            this.port.off('data', handleData);
            try {
              const parsedData = this.parseResponse(responseBuffer);
              console.log('Monster Meter data parsed successfully:', {
                swVersion: parsedData.SW_Version,
                sensorHiVoltage: parsedData['SensorHi.vAVG'],
                sensorLoVoltage: parsedData['SensorLo.vAVG'],
              });
              this.emit('dataReceived', parsedData);
              resolve(parsedData);
            } catch (parseError) {
              console.log(`[Communication] Parse failed: ${parseError.message}`);
              setTimeout(tryRead, MONSTER_METER_CONSTANTS.DATA_TIMEOUT);
            }
          }
        };

        this.port.on('data', handleData);

        const timeout = setTimeout(() => {
          this.port?.off('data', handleData);
          console.log(`[Communication] No response after ${MONSTER_METER_CONSTANTS.DATA_TIMEOUT}ms, retrying`);
          tryRead();
        }, MONSTER_METER_CONSTANTS.DATA_TIMEOUT);
      };

      tryRead();
    });
  }

  parseResponse(buffer) {
    if (buffer.length < 97) {
      throw new Error(`Response too short: ${buffer.length} bytes (minimum 97 required)`);
    }

    console.log(`[Parse] Buffer length: ${buffer.length}`);
    console.log(`[Parse] First 10 bytes:`, this.formatBytes(buffer.slice(0, 10)));
    console.log(`[Parse] SW_Version bytes (73-100):`, this.formatBytes(buffer.slice(73, 100)));

    // Parse values efficiently
    const values = [
      // Read initial bytes
      ...Array.from(buffer.slice(0, 5)),
      // Read float values
      ...Array.from({ length: 18 }, (_, i) => buffer.readFloatLE(5 + i * 4)),
    ];

    // Parse software version
    const swVersion = buffer.slice(73, 100).toString('utf8').split('\x00')[0];
    console.log(`[Parse] Raw SW_Version string: "${swVersion}" (length: ${swVersion.length})`);

    // Build data object
    const data = Object.fromEntries(MONSTER_METER_CONSTANTS.DATA_KEYS.map((key, i) => [key, values[i]]));

    data.SW_Version = swVersion;

    console.log(`[Parse] Final SW_Version: "${data.SW_Version}"`);
    console.log(`[Parse] Sample sensor data - SensorHi.vAVG: ${data['SensorHi.vAVG']}, SensorLo.vAVG: ${data['SensorLo.vAVG']}`);

    return data;
  }

  getDisplayData(fullData) {
    const displayData = Object.fromEntries(MONSTER_METER_CONSTANTS.DISPLAY_DATA_KEYS.filter(key => fullData[key] !== undefined).map(key => [key, fullData[key]]));

    displayData.SW_Version = fullData.SW_Version;
    return displayData;
  }

  // Helper methods
  formatBytes(buffer) {
    return Array.from(buffer)
      .map(b => `0x${b.toString(16).padStart(2, '0')}`)
      .join(' ');
  }

  handleError(method, error, extra = {}) {
    Sentry.captureException(error, {
      tags: { service: 'monster-meter-communication', method },
      extra,
    });
    console.error(`Failed in ${method}:`, error);
  }

  cleanup() {
    console.log('[Communication] Starting cleanup...');
    this.port = null;
    this.isReading = false;
    this.removeAllListeners();
    console.log('[Communication] Cleanup completed');
  }

  destroy() {
    this.cleanup();
    communicationInstance = null;
    console.log('[Communication] Service destroyed');
  }
}

// Singleton instance
let communicationInstance = null;

export function getMonsterMeterCommunication() {
  if (!communicationInstance) {
    communicationInstance = new MonsterMeterCommunicationService();
  }
  return communicationInstance;
}

export { MonsterMeterCommunicationService };
