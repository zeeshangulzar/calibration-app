/**
 * Utility functions for BLE operations
 */

export async function discoverWithTimeout(peripheral, timeoutMs = 20000) {
  return Promise.race([
    peripheral.discoverAllServicesAndCharacteristicsAsync(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Discovery timed out")), timeoutMs)
    ),
  ]);
}

export function parsePressureData(data) {
  try {
    // Extract pressure data from bytes 16-21 and convert to PSI (same as old app)
    const devicePressure = data
      .slice(16, 21)
      .toString('utf-8')
      .replace(/\0/g, ''); // Remove null characters
    
    return Math.round(parseFloat(devicePressure)) / 10;
  } catch (error) {
    console.error('Failed to parse pressure data:', error);
    return 0.0;
  }
}
