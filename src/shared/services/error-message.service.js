/**
 * Error Message Service
 * Centralized service for creating specific, contextual error messages
 * across the entire calibration application
 */

export class ErrorMessageService {
  /**
   * Create specific error message for UART command failures
   * @param {string} command - Command that failed
   * @param {Error} error - Original error
   * @param {string} deviceName - Device name
   * @returns {string} Specific error message
   */
  static createUARTErrorMessage(command, error, deviceName) {
    if (!error) {
      return `${command} command failed on ${deviceName} with no error details`;
    }

    const errorMessage = error.message || '';

    // Categorize errors and provide specific messages
    if (errorMessage.includes('timeout') || errorMessage.includes('Command timeout')) {
      return `${command} command timed out on ${deviceName} - device not responding`;
    }

    if (errorMessage.includes('Subscription failed')) {
      return `${command} command failed on ${deviceName} - unable to establish communication channel`;
    }

    if (errorMessage.includes('Write failed')) {
      return `${command} command failed on ${deviceName} - unable to send data to device`;
    }

    if (errorMessage.includes('UART characteristics not found')) {
      return `${command} command failed on ${deviceName} - device communication interface not available`;
    }

    if (errorMessage.includes('Unexpected server ID') || errorMessage.includes('Unexpected command ID')) {
      return `${command} command failed on ${deviceName} - device returned invalid response format`;
    }

    if (errorMessage.includes('DEVICE_DISCONNECTED')) {
      return `${command} command failed - ${deviceName} was disconnected during execution`;
    }

    if (errorMessage.includes('Unknown command')) {
      return `${command} is not supported by ${deviceName}`;
    }

    // If we have a message but don't recognize the pattern, use it directly
    if (errorMessage.trim()) {
      return `${command} command failed on ${deviceName}: ${errorMessage}`;
    }

    // Only as absolute last resort
    return `${command} command failed on ${deviceName} - device communication error`;
  }

  /**
   * Create specific error message for Kraken calibration failures
   * @param {string} commandType - Type of command that failed (Zero, Low, High)
   * @param {Error} error - Original error
   * @param {string} deviceName - Device name
   * @returns {string} Specific error message
   */
  static createKrakenCalibrationErrorMessage(commandType, error, deviceName) {
    if (!error) {
      return `${commandType} command failed on ${deviceName} - no error details available`;
    }

    const errorMessage = error.message || '';

    // Device disconnection
    if (errorMessage.includes('DEVICE_DISCONNECTED') || errorMessage.includes('disconnected')) {
      return `${commandType} command failed - ${deviceName} was disconnected`;
    }

    // Communication timeouts
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      return `${commandType} command failed on ${deviceName} - device communication timeout`;
    }

    // UART/BLE specific errors
    if (errorMessage.includes('UART characteristics not found')) {
      return `${commandType} command failed on ${deviceName} - device communication interface unavailable`;
    }

    if (errorMessage.includes('Subscription failed') || errorMessage.includes('Write failed')) {
      return `${commandType} command failed on ${deviceName} - unable to communicate with device`;
    }

    // Invalid responses
    if (errorMessage.includes('Unexpected server ID') || errorMessage.includes('Unexpected command ID')) {
      return `${commandType} command failed on ${deviceName} - device returned invalid response`;
    }

    // Command not supported
    if (errorMessage.includes('Unknown command')) {
      return `${commandType} command is not supported by ${deviceName}`;
    }

    // Fluke-related errors
    if (errorMessage.includes('Fluke')) {
      return `${commandType} command failed on ${deviceName} - Fluke calibrator error: ${errorMessage}`;
    }

    // If we have a specific message, use it with context
    if (errorMessage.trim()) {
      return `${commandType} command failed on ${deviceName}: ${errorMessage}`;
    }

    // Last resort with meaningful context
    return `${commandType} command failed on ${deviceName} - device communication error`;
  }

  /**
   * Create specific error message for Fluke-related failures
   * @param {Error} error - Original Fluke error
   * @returns {string} Specific Fluke error message
   */
  static createFlukeErrorMessage(error) {
    if (!error) {
      return 'Fluke calibrator communication failed';
    }

    const errorMessage = error.message || '';

    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return 'Fluke calibrator not responding - communication timeout';
    }

    if (errorMessage.includes('not responding')) {
      return 'Fluke calibrator is not responding to commands';
    }

    if (errorMessage.includes('connection') || errorMessage.includes('connect')) {
      return 'Unable to connect to Fluke calibrator';
    }

    if (errorMessage.includes('busy') || errorMessage.includes('Busy')) {
      return 'Fluke calibrator is busy and cannot process commands';
    }

    if (errorMessage.trim()) {
      return `Fluke calibrator error: ${errorMessage}`;
    }

    return 'Fluke calibrator communication failed';
  }

  /**
   * Create specific error message for verification failures
   * @param {string} operation - Type of operation that failed
   * @param {Error} error - Original error
   * @param {string} deviceName - Device name (optional)
   * @returns {string} Specific error message
   */
  static createVerificationErrorMessage(operation, error, deviceName = '') {
    if (!error) {
      return `${operation} failed${deviceName ? ` on ${deviceName}` : ''} - no error details available`;
    }

    const errorMessage = error.message || '';
    const deviceContext = deviceName ? ` on ${deviceName}` : '';

    // PDF generation errors
    if (errorMessage.includes('PDF') || errorMessage.includes('template')) {
      return `${operation} failed${deviceContext} - unable to generate verification report`;
    }

    // Data processing errors
    if (errorMessage.includes('data') || errorMessage.includes('undefined') || errorMessage.includes('null')) {
      return `${operation} failed${deviceContext} - verification data is incomplete or corrupted`;
    }

    // File system errors
    if (errorMessage.includes('ENOENT') || errorMessage.includes('file not found')) {
      return `${operation} failed${deviceContext} - required verification files not found`;
    }

    if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
      return `${operation} failed${deviceContext} - insufficient permissions to access verification files`;
    }

    // Device communication errors
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      return `${operation} failed${deviceContext} - device communication timeout`;
    }

    if (errorMessage.includes('disconnected') || errorMessage.includes('DEVICE_DISCONNECTED')) {
      return `${operation} failed - ${deviceName || 'device'} was disconnected`;
    }

    // Calibration state errors
    if (errorMessage.includes('calibration') || errorMessage.includes('not calibrated')) {
      return `${operation} failed${deviceContext} - device must be calibrated before verification`;
    }

    // Fluke errors
    if (errorMessage.includes('Fluke') || errorMessage.includes('pressure')) {
      return `${operation} failed${deviceContext} - Fluke calibrator error: ${errorMessage}`;
    }

    // Mathematical/calculation errors
    if (errorMessage.includes('calculation') || errorMessage.includes('NaN') || errorMessage.includes('invalid')) {
      return `${operation} failed${deviceContext} - verification calculations could not be completed`;
    }

    // If we have a specific message, use it with context
    if (errorMessage.trim()) {
      return `${operation} failed${deviceContext}: ${errorMessage}`;
    }

    // Last resort with meaningful context
    return `${operation} failed${deviceContext} - verification process error`;
  }

  /**
   * Create specific error message for Monster Meter operations
   * @param {string} operation - Type of operation that failed
   * @param {Error} error - Original error
   * @returns {string} Specific error message
   */
  static createMonsterMeterErrorMessage(operation, error) {
    if (!error) {
      return `Monster Meter ${operation} failed - no error details available`;
    }

    const errorMessage = error.message || '';

    // Communication errors
    if (errorMessage.includes('timeout') || errorMessage.includes('not responding')) {
      return `Monster Meter ${operation} failed - device not responding`;
    }

    if (errorMessage.includes('Serial port not available')) {
      return `Monster Meter ${operation} failed - serial port not available`;
    }

    if (errorMessage.includes('Response too short')) {
      return `Monster Meter ${operation} failed - incomplete data received`;
    }

    // Calibration specific errors
    if (errorMessage.includes('coefficients') || errorMessage.includes('NaN')) {
      return `Monster Meter ${operation} failed - unable to calculate calibration coefficients`;
    }

    if (errorMessage.includes('verification')) {
      return `Monster Meter ${operation} failed - verification data processing error`;
    }

    // If we have a specific message, use it with context
    if (errorMessage.trim()) {
      return `Monster Meter ${operation} failed: ${errorMessage}`;
    }

    return `Monster Meter ${operation} failed - communication error`;
  }

  /**
   * Create specific error message for general application errors
   * @param {string} context - Context where error occurred
   * @param {Error} error - Original error
   * @returns {string} Specific error message
   */
  static createGeneralErrorMessage(context, error) {
    if (!error) {
      return `${context} failed - no error details available`;
    }

    const errorMessage = error.message || '';

    // Network errors
    if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
      return `${context} failed - network timeout`;
    }

    if (errorMessage.includes('ECONNREFUSED')) {
      return `${context} failed - connection refused`;
    }

    if (errorMessage.includes('ENOTFOUND')) {
      return `${context} failed - server not found`;
    }

    // File system errors
    if (errorMessage.includes('ENOENT')) {
      return `${context} failed - file or directory not found`;
    }

    if (errorMessage.includes('EACCES')) {
      return `${context} failed - permission denied`;
    }

    // If we have a specific message, use it with context
    if (errorMessage.trim()) {
      return `${context} failed: ${errorMessage}`;
    }

    return `${context} failed - unknown error occurred`;
  }
}
