import { FlukeFactoryService } from './fluke-factory.service.js';
import * as Sentry from '@sentry/electron/main';

/**
 * GVI Flow Meter Calibration Service
 * Handles the business logic for GVI flow meter calibration
 */
export class GVICalibrationService {
  constructor(gviState, sendToRenderer, showLogOnScreen) {
    this.gviState = gviState;
    this.sendToRenderer = sendToRenderer;
    this.showLogOnScreen = showLogOnScreen;
    this.flukeFactory = new FlukeFactoryService();
    this.fluke = null;

    this.reset();
  }

  reset() {
    this.config = null;
    this.isRunning = false;
    this.isCalibrationActive = false;
    this.startTime = null;
    this.currentStep = 0;
    this.steps = [];
    this.results = null;
    this.testerName = '';
    this.model = '';
    this.serialNumber = '';
  }

  /**
   * Initialize the calibration service with configuration
   */
  async initialize() {
    try {
      this.fluke = this.flukeFactory.getFlukeService(this.showLogOnScreen, () => this.gviState.isCalibrationActive);

      return { success: true };
    } catch (error) {
      this.handleError(error, 'initialize');
      throw error;
    }
  }

  /**
   * Start the calibration process
   */
  async startCalibration(testerName, model, serialNumber, steps) {
    try {
      this.logDebugInfo('startCalibration', { testerName, model, serialNumber });

      this.initializeCalibrationState(testerName, model, serialNumber, steps);
      this.validateConfiguration();

      this.sendToRenderer('gvi-calibration-started', {
        totalSteps: this.steps.length,
        model: this.model,
        tester: this.tester,
        serialNumber: this.serialNumber,
      });
      await this.runCalibrationProcess();
      // Don't complete calibration here - it will be completed when all steps are done
      return { success: true };
    } catch (error) {
      return this.handleCalibrationError(error);
    }
  }

  /**
   * Core calibration process - follows Monster Meter pattern
   */
  async runCalibrationProcess() {
    try {
      // Connect to Fluke device first
      await this.connectToFluke();

      // Run prerequisites
      await this.runFlukePreReqs();
      await this.checkZeroPressure();
      await this.waitForFluke();

      // Start the first calibration step
      await this.runCalibrationSteps();
    } catch (error) {
      this.showLogOnScreen(`❌ Calibration process failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Complete calibration with final result (PASS/FAIL)
   */
  async completeCalibrationWithResult(passed) {
    try {
      const results = {
        config: this.config,
        model: this.model,
        tester: this.tester,
        serialNumber: this.serialNumber,
        result: passed ? 'PASS' : 'FAIL',
        completedAt: new Date().toISOString(),
        steps: this.steps.map(step => ({
          gpm: step.gpm,
          psi: step.psiMin,
          // User noted GPM values manually in their diary
        })),
      };

      this.results = results;

      // Set Fluke to zero after calibration completion
      this.fluke.setZeroPressureToFluke();

      this.showLogOnScreen(`✅ Calibration completed - Result: ${passed ? 'PASS' : 'FAIL'}`);
      this.sendToRenderer('gvi-calibration-completed', results);

      return { success: true, results };
    } catch (error) {
      this.handleError(error, 'completeCalibrationWithResult');
      throw error;
    }
  }

  /**
   * Complete calibration process (called when all steps are done)
   */
  async completeCalibration() {
    try {
      this.showLogOnScreen('🎯 All steps completed - waiting for final result');
      // Don't complete yet - wait for user to provide final PASS/FAIL result
      return { success: true };
    } catch (error) {
      this.handleError(error, 'completeCalibration');
      throw error;
    }
  }

  /**
   * Handle final calibration result (PASS/FAIL)
   */
  async handleFinalResult(passed) {
    try {
      if (!this.isCalibrationActive) {
        throw new Error('Calibration not running');
      }

      this.isCalibrationActive = false;
      await this.completeCalibrationWithResult(passed);
      return { success: true };
    } catch (error) {
      this.handleError(error, 'handleFinalResult');
      throw error;
    }
  }

  // Calibration process steps
  async connectToFluke() {
    await this.executeWithLogging('Connecting to Fluke device', async () => {
      const result = await this.fluke.connect();
      if (!result.success) {
        throw new Error(result.error || 'Failed to connect to Fluke device');
      }
      return result;
    });
  }

  async runFlukePreReqs() {
    await this.executeWithLogging('Fluke prerequisites', () => this.fluke.runPreReqs());
  }

  async checkZeroPressure() {
    try {
      await this.fluke.setZeroPressureToFluke();
      await this.fluke.waitForFlukeToReachZeroPressure(true);
    } catch (error) {
      this.showLogOnScreen(`❌ Zero pressure check failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  async waitForFluke() {
    try {
      await this.fluke.waitForFlukeToReachZeroPressure();
    } catch (error) {
      this.showLogOnScreen(`❌ Wait for Fluke failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  async runCalibrationSteps() {
    // Process the first step
    await this.processNextStep();
  }

  async processNextStep() {
    console.log(`GVI Service - processNextStep called, currentStep: ${this.currentStep}, totalSteps: ${this.steps.length}`);

    // Check if calibration is still active
    if (!this.isCalibrationActive) {
      return;
    }

    if (this.currentStep >= this.steps.length) {
      this.showLogOnScreen('✅ All calibration steps completed');
      return;
    }

    const step = this.steps[this.currentStep];
    console.log(`GVI Service - processing step:`, step);
    this.showLogOnScreen(`Step ${this.currentStep + 1}/${this.steps.length}: ${step.gpm} GPM`);

    // Set pressure for this step
    await this.setPressureForStep(step);

    // Check again before sending step ready event
    if (!this.isCalibrationActive) {
      return;
    }

    // Send step ready event to renderer
    this.sendToRenderer('gvi-step-ready', {
      stepIndex: this.currentStep,
      step: step,
      currentStep: this.currentStep + 1,
      totalSteps: this.steps.length,
    });
  }

  async nextStep() {
    if (!this.isCalibrationActive) {
      throw new Error('Calibration not running');
    }

    // Increment to next step
    this.currentStep++;
    console.log(`GVI Service - nextStep called, currentStep: ${this.currentStep}, totalSteps: ${this.steps.length}`);

    if (this.currentStep >= this.steps.length) {
      this.showLogOnScreen('✅ All calibration steps completed');
      return { success: true, completed: true };
    }

    await this.processNextStep();
    return { success: true, completed: false };
  }

  async setPressureForStep(step) {
    // Check if calibration is still active before setting pressure
    if (!this.isCalibrationActive) {
      return;
    }

    const pressure = step.psiMin;
    await this.fluke.setHighPressureToFluke(pressure);

    // Check again before waiting for pressure
    if (!this.isCalibrationActive) {
      return;
    }

    await this.fluke.waitForFlukeToReachTargetPressure(pressure);

    // Final check before showing success message
    if (!this.isCalibrationActive) {
      return;
    }
  }

  async setFlukeToZero(silent = false) {
    if (this.fluke) {
      await this.fluke.setZeroPressureToFluke(silent);
    }
  }

  // Utility methods
  initializeCalibrationState(testerName, model, serialNumber, steps) {
    this.testerName = testerName;
    this.model = model;
    this.serialNumber = serialNumber;
    this.steps = steps || [];
    this.currentStep = 0;
    this.isCalibrationActive = true;
  }

  validateConfiguration() {
    if (!this.testerName || !this.model || !this.serialNumber) {
      throw new Error('Missing required calibration parameters');
    }
    if (!this.steps || this.steps.length === 0) {
      throw new Error('No calibration steps defined');
    }
  }

  logDebugInfo(method, params) {
    console.log(`🔍 Debug - ${method} received parameters:`, params);
  }

  handleCalibrationError(error) {
    this.isCalibrationActive = false;
    this.handleError(error, 'startCalibration');

    // Debug: Log the error details
    console.log('GVI Calibration Service - Error object:', error);
    console.log('GVI Calibration Service - Error message:', error.message);
    console.log('GVI Calibration Service - Error error:', error.error);
    console.log('GVI Calibration Service - Error toString:', error.toString());

    const errorMessage = error.message || error.error || error.toString() || 'Unknown error';
    console.log('GVI Calibration Service - Final error message:', errorMessage);

    this.sendToRenderer('gvi-calibration-failed', { error: errorMessage });
    return { success: false, error: errorMessage };
  }

  async executeWithLogging(action, fn) {
    this.showLogOnScreen(`🔧 ${action}...`);
    try {
      await fn();
      this.showLogOnScreen(`✅ ${action} completed`);
    } catch (error) {
      this.showLogOnScreen(`❌ ${action} failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  isActive = () => this.isCalibrationActive;

  getStatus() {
    return {
      isActive: this.isCalibrationActive,
      testerName: this.testerName,
      model: this.model,
      serialNumber: this.serialNumber,
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      results: this.results,
    };
  }

  handleError(error, method) {
    Sentry.captureException(error, {
      tags: { component: 'gvi-calibration-service', method },
    });
    console.error(`GVICalibrationService.${method}:`, error);
  }

  async stopCalibration() {
    this.isCalibrationActive = false;

    // Set Fluke to zero immediately
    if (this.fluke) {
      this.fluke.setZeroPressureToFluke(true);
    }
  }

  async cleanup() {
    try {
      // Stop calibration if active
      if (this.isCalibrationActive) {
        this.isCalibrationActive = false;
      }

      // Set Fluke to zero and disconnect if connected
      if (this.fluke && this.fluke.telnetClient && this.fluke.telnetClient.isConnected) {
        await this.setFlukeToZero(true);

        await this.fluke.telnetClient.disconnect();
      }

      this.reset();
    } catch (error) {
      this.handleError(error, 'cleanup');
    }
  }

  reset() {
    this.isCalibrationActive = false;
    this.testerName = '';
    this.model = '';
    this.serialNumber = '';
    this.currentStep = 0;
    this.steps = [];
    this.results = null;
    this.fluke = null;
  }

  destroy = async () => {
    try {
      await this.cleanup();
    } catch (error) {
      this.handleError(error, 'destroy');
    }
  };
}
