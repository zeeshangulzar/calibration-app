/**
 * Assembly Sensors Constants
 * Configuration values for the assembly sensors module
 */

export const ASSEMBLY_SENSORS_CONSTANTS = {
  // Debounce timing for invalid QR code alerts (in milliseconds)
  INVALID_QR_DEBOUNCE_TIME: 2000,
  
  // QR Code patterns
  QR_PATTERNS: {
    CAP_PATTERN: /^(\d{2})-(\d{2})-(\d{4})$/,
    BODY_PATTERN: /^\d{6}$/
  },
  
  // Week validation
  WEEK_VALIDATION: {
    MIN_WEEK: 1,
    MAX_WEEK: 53
  }
};
