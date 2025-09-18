// Kraken BLE Service and Characteristic UUIDs (from old app)
export const KRAKEN_CONSTANTS = {
  // Primary Kraken Service
  SERVICE_UUID: '7db2588688c8495ca4518e43d5e8e7d0',

  // Pressure-related characteristics
  PRESSURE_CHARACTERISTIC_UUID: 'dab8fe8e75d948f3a6a09bdfb9435121',

  // Device information characteristics
  DISPLAY_NAME_CHARACTERISTIC_UUID: 'c91a9bbe24700ce481ed818844bdca4e',
  FIRMWARE_REVISION_CHARACTERISTIC_UUID: '2a26',
  MODEL_NUMBER_CHARACTERISTIC_UUID: '2a24',
  SERIAL_NUMBER_CHARACTERISTIC_UUID: '2a25',

  // Connection and discovery timeouts (in milliseconds)
  CONNECTION_TIMEOUT: 30000, // 30 seconds
  DISCOVERY_TIMEOUT: 15000, // 15 seconds
  SUBSCRIPTION_TIMEOUT: 5000, // 5 seconds

  // Retry configuration
  MAX_RETRIES_PER_KRAKEN: 3, // Maximum retry attempts per kraken for both connection and setup

  // Delay timings (in milliseconds)
  DELAY_BETWEEN_CONNECTIONS: 1500, // 1.5 second delay between successful connections
  DELAY_BETWEEN_SETUP: 1500, // 1.5 second delay between device setups
  DELAY_BETWEEN_RETRIES: 2000, // 2 second delay between retry attempts
  DELAY_BEFORE_SETUP: 2000, // 2 second delay before starting device setup
  DELAY_BLE_STACK_RELEASE: 1000, // 1 second delay for Windows BLE stack to release

  CONNECT_BUTTON_COOLDOWN_MS: 5000, // 5 seconds cooldown for the connect button

  // Operation timeouts (in milliseconds)
  CHARACTERISTIC_READ_TIMEOUT: 15000, // 15 seconds for characteristic reads (increased from 5s)
  DISCONNECT_TIMEOUT: 5000, // 5 seconds for disconnect operations
  MANUAL_DISCONNECT_TIMEOUT: 3000, // 3 seconds for manual disconnect operations
  CONNECTIVITY_MONITOR_INTERVAL: 2000, // 2 seconds for connectivity monitoring
  CLEANUP_TIMEOUT: 3000, // 3 seconds for cleanup operations
  SCANNER_REFRESH_DELAY: 1000, // 1 second delay for scanner refresh

  // DELAY BETWEEN commands snet to kraken
  DELAY_BETWEEN_COMMANDS: 2000,

  // Sweep value
  SWEEP_VALUE: 300,

  // delay after pressure is set
  DELAY_AFTER_PRESSURE_SET: 3000,

  // Device connection states
  CONNECTION_STATES: {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTING: 'disconnecting',
    ERROR: 'error',
  },

  // Device limits
  MAX_PRESSURE: 300,

  // Calibration settings
  TESTER_NAMES: { Gabriel: 'Gabriel Nunez' },

  // Discrepancy tolerance
  DISCREPANCY_TOLERANCE: 1.5,

  // Calibration temperature
  CALIBRATION_TEMPERATURE: 'N/A', // Default calibration temperature
};
