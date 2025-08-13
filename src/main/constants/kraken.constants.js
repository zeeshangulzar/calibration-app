// Kraken BLE Service and Characteristic UUIDs (from old app)
export const KRAKEN_CONSTANTS = {
  // Primary Kraken Service
  SERVICE_UUID: "7db2588688c8495ca4518e43d5e8e7d0",
  
  // Pressure-related characteristics
  PRESSURE_CHARACTERISTIC_UUID: "dab8fe8e75d948f3a6a09bdfb9435121",
  MIN_PRESSURE_CHARACTERISTIC_UUID: "f55867407cf34aafbfb4748b12f3f525",
  MAX_PRESSURE_CHARACTERISTIC_UUID: "0747a448372948a4a105559078ad7d35",
  
  // Device information characteristics
  DISPLAY_NAME_CHARACTERISTIC_UUID: "c91a9bbe24700ce481ed818844bdca4e",
  FIRMWARE_REVISION_CHARACTERISTIC_UUID: "2a26",
  INFORMATION_SERVICE_UUID: "180a",
  
  // Connection and discovery timeouts (in milliseconds)
  CONNECTION_TIMEOUT: 30000,    // 30 seconds
  DISCOVERY_TIMEOUT: 15000,     // 15 seconds
  SUBSCRIPTION_TIMEOUT: 5000,   // 5 seconds
  
  // Device limits
  MAX_DEVICES: 10,
  
  // Pressure data parsing
  PRESSURE_DATA_LENGTH: 4,      // 4 bytes for float32
  
  // Device connection states
  CONNECTION_STATES: {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTING: 'disconnecting',
    ERROR: 'error'
  }
};

// Signal strength mapping
export function getSignalStrengthInfo(rssi) {
  let barWidth = 0;
  let strength = "";
  let colorClass = "";

  if (rssi >= -40) {
    strength = "Excellent";
    barWidth = 100;
    colorClass = "bg-green-500";
  } else if (rssi >= -55) {
    strength = "Good";
    barWidth = 80;
    colorClass = "bg-green-400";
  } else if (rssi >= -70) {
    strength = "Fair";
    barWidth = 60;
    colorClass = "bg-yellow-500";
  } else if (rssi >= -85) {
    strength = "Weak";
    barWidth = 40;
    colorClass = "bg-orange-500";
  } else {
    strength = "Poor";
    barWidth = 20;
    colorClass = "bg-red-500";
  }

  return {
    barWidth,
    strength,
    colorClass,
  };
} 