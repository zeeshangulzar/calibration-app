/**
 * Simple Mock Fluke Service for Development
 * Mocks the Fluke pressure calibrator methods without using telnet
 */
class FlukeMockService {
  constructor() {
    this.currentPressure = 0;
    console.log('🔧 Mock Fluke Service initialized for development');
  }

  /**
   * Mock method - sets pressure to zero
   * @param {boolean} silent - Whether to suppress logging
   */
  async setZeroPressureToFluke(silent = false) {
    if (!silent) {
      console.log('🔧 [MOCK] Setting Fluke to zero pressure');
    }
    this.currentPressure = 0;
    await this.mockDelay(100);
    if (!silent) {
      console.log('✅ [MOCK] Fluke set to zero pressure');
    }
  }

  /**
   * Mock method - sets high pressure
   * @param {number} pressure - Target pressure in PSI
   */
  async setHighPressureToFluke(pressure) {
    console.log(`🔧 [MOCK] Setting Fluke to ${pressure} PSI`);
    this.currentPressure = pressure;
    await this.mockDelay(200);
    console.log(`✅ [MOCK] Fluke set to ${pressure} PSI`);
  }

  /**
   * Mock method - waits for zero pressure
   */
  async waitForFlukeToReachZeroPressure() {
    console.log('⏳ [MOCK] Waiting for Fluke to reach zero pressure');
    await this.mockDelay(500);
    console.log('✅ [MOCK] Fluke reached zero pressure');
  }

  /**
   * Mock method - waits for target pressure
   * @param {number} targetPressure - Target pressure to wait for
   */
  async waitForFlukeToReachTargetPressure(targetPressure) {
    console.log(`⏳ [MOCK] Waiting for Fluke to reach ${targetPressure} PSI`);
    await this.mockDelay(500);
    console.log(`✅ [MOCK] Fluke reached ${targetPressure} PSI`);
  }

  /**
   * Mock method - gets current pressure
   * @returns {number} Current pressure
   */
  getCurrentPressure() {
    return this.currentPressure;
  }

  /**
   * Mock method - connects to Fluke (no-op)
   */
  async connect() {
    console.log('🔧 [MOCK] Connecting to Fluke (no-op)');
    return { success: true, message: 'Mock Fluke connected' };
  }

  /**
   * Mock method - runs prerequisites (no-op)
   */
  async runPreReqs() {
    console.log('🔧 [MOCK] Running Fluke prerequisites (no-op)');
  }

  /**
   * Mock method - checks zero pressure (no-op)
   */
  async checkZeroPressure() {
    console.log('🔧 [MOCK] Checking zero pressure (no-op)');
    return true;
  }

  /**
   * Mock method - sets zero pressure with verification (no-op)
   */
  async setZeroPressureToFlukeWithVerification() {
    console.log('🔧 [MOCK] Setting zero pressure with verification (no-op)');
    return true;
  }

  /**
   * Mock method - ensures zero pressure (no-op)
   */
  async ensureZeroPressure() {
    console.log('🔧 [MOCK] Ensuring zero pressure (no-op)');
    return true;
  }

  /**
   * Mock method - sets high pressure with verification (no-op)
   * @param {number} sweepValue - Sweep value
   */
  async setHighPressureToFlukeWithVerification(sweepValue) {
    console.log(`🔧 [MOCK] Setting high pressure ${sweepValue} PSI with verification (no-op)`);
    return true;
  }

  /**
   * Mock method - checks Fluke responsiveness (no-op)
   */
  async checkFlukeResponsiveness() {
    console.log('🔧 [MOCK] Checking Fluke responsiveness (no-op)');
    return true;
  }

  /**
   * Mock method - disconnects from Fluke (no-op)
   */
  async disconnect() {
    console.log('🔧 [MOCK] Disconnecting from Fluke (no-op)');
  }

  /**
   * Simple delay simulation
   * @param {number} ms - Milliseconds to delay
   */
  async mockDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { FlukeMockService };
