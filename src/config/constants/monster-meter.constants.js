/* prettier-ignore-file */
/**
 * Monster Meter Constants
 * Centralized configuration for Monster Meter functionality
 */
export const MONSTER_METER_CONSTANTS = {
  // Serial Communication
  BAUD_RATE: 9600,
  DATA_TIMEOUT: 5000,
  MAX_RETRIES: 3,
  SWEEP_VALUE: 250,

  TOLERANCE_RANGE: 1.5,

  // Commands (from old app)
  // eslint-disable prettier/prettier
  COMMANDS: {
    START_CAL: 0xA1,
    STOP_CAL: 0xA2,
    SET_DATA: 0xA3,
    GET_DATA: 0xA4,
    ZERO_HIGH: 0xA5,
    ZERO_LOW: 0xA6,
    VERIFY_ME: 0xA7,
  },
  // eslint-enable prettier/prettier

  // Buffer Sizes
  COMMAND_BUFFER_SIZE: 36,

  // Delays (milliseconds)
  DELAY_AFTER_COMMAND: 2000,

  // Auto-Update Timeouts
  USB_ATTACH_DELAY: 2000, // Delay after USB device attach before refreshing ports
  USB_DETACH_DELAY: 1000, // Delay after USB device detach before refreshing ports
  POLLING_INTERVAL: 5000, // Port polling interval in milliseconds
  UI_UPDATE_DELAY: 100, // Brief delay for UI updates (UX enhancement)

  // Data Keys (from monster meter response)
  DATA_KEYS: [
    'AVG_Samples',
    'DisplayUpdateTime',
    'DataRate',
    'GAIN',
    'MaxPresure',
    'SensorHi.coeA',
    'SensorHi.coeB',
    'SensorHi.coeC',
    'SensorHi.psiAVG',
    'SensorHi.vRAW[0]',
    'SensorHi.vAVG',
    'SensorHi.vZero',
    'SensorLo.coeA',
    'SensorLo.coeB',
    'SensorLo.coeC',
    'SensorLo.psiAVG',
    'SensorLo.vRAW[0]',
    'SensorLo.vAVG',
    'SensorLo.vZero',
    'rounddP',
    'GPM',
    'INPN_num',
  ],

  // Data keys to display (filtered for UI)
  DISPLAY_DATA_KEYS: ['SensorHi.psiAVG', 'SensorLo.psiAVG', 'SensorHi.vAVG', 'SensorLo.vAVG'],

  // Calibration settings
  TESTER_NAMES: {
    Gabriel: 'Gabriel',
    'Tester 1': 'Tester 1',
    'Tester 2': 'Tester 2',
  },

  // Model options
  MODEL_OPTIONS: {
    'GK-MM-250': 'GK-MM-250',
    'GK-MM-WC-250': 'GK-MM-WC-250',
  },
};
