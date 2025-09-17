import EventEmitter from 'events';
import * as Sentry from '@sentry/electron/main';

/**
 * GVI Calibration State Service
 * Manages the state of GVI calibration process
 */
class GVICalibrationStateService extends EventEmitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.isCalibrating = false;
    this.isCalibrationActive = false;
    this.currentStepIndex = 0;
    this.calibrationSteps = [];
    this.currentPressure = null;
    this.currentGPM = null;
    this.testResults = [];
    this.model = null;
    this.tester = null;
    this.serialNumber = null;
    this.currentConfig = null;
    this.totalSteps = 0;
  }

  /**
   * Start calibration process
   */
  startCalibration(model, tester, serialNumber, steps) {
    try {
      this.isCalibrating = true;
      this.isCalibrationActive = true;
      this.model = model;
      this.tester = tester;
      this.serialNumber = serialNumber;
      this.calibrationSteps = steps;
      this.totalSteps = steps.length;
      this.currentStepIndex = 0;
      this.currentPressure = null;
      this.currentGPM = null;
      this.testResults = [];

      this.emit('calibrationStarted', {
        model,
        tester,
        serialNumber,
        totalSteps: this.totalSteps,
        currentStep: this.currentStepIndex,
      });

      console.log(`[State] Calibration started - Model: ${model}, Tester: ${tester}, Steps: ${this.totalSteps}`);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: 'gvi-state-service' },
        extra: { method: 'startCalibration', model, tester, serialNumber, stepsCount: steps?.length },
      });
      throw error;
    }
  }

  /**
   * Complete calibration
   */
  completeCalibration() {
    try {
      this.isCalibrating = false;
      this.isCalibrationActive = false;
      this.emit('calibrationCompleted', {
        model: this.model,
        tester: this.tester,
        serialNumber: this.serialNumber,
        testResults: this.testResults,
      });
      console.log(`[State] Calibration completed - Model: ${this.model}`);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: 'gvi-state-service' },
        extra: { method: 'completeCalibration', model: this.model },
      });
      throw error;
    }
  }

  /**
   * Set current configuration
   */
  setCurrentConfig(config) {
    this.currentConfig = config;
  }

  /**
   * Get current configuration
   */
  getCurrentConfig() {
    return this.currentConfig;
  }

  /**
   * Update calibration status
   */
  updateCalibrationStatus(isActive) {
    this.isCalibrationActive = isActive;
    if (!isActive) {
      this.isCalibrating = false;
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      isCalibrating: this.isCalibrating,
      isCalibrationActive: this.isCalibrationActive,
      currentStepIndex: this.currentStepIndex,
      calibrationSteps: this.calibrationSteps,
      currentPressure: this.currentPressure,
      currentGPM: this.currentGPM,
      testResults: this.testResults,
      model: this.model,
      tester: this.tester,
      serialNumber: this.serialNumber,
      currentConfig: this.currentConfig,
      totalSteps: this.totalSteps,
    };
  }

  /**
   * Cleanup state service
   */
  async cleanup() {
    try {
      console.log('[State] Starting cleanup...');
      this.reset();
      this.removeAllListeners();
      console.log('[State] Cleanup completed');
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: 'gvi-state-service' },
        extra: { method: 'cleanup' },
      });
      console.error('[State] Error during cleanup:', error);
    }
  }

  /**
   * Destroy state service
   */
  destroy() {
    this.cleanup();
    console.log('[State] Service destroyed');
  }
}

// Singleton instance
let stateInstance = null;

export function getGVICalibrationState() {
  if (!stateInstance) {
    stateInstance = new GVICalibrationStateService();
  }
  return stateInstance;
}

export { GVICalibrationStateService };
