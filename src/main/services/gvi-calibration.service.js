import { FlukeFactoryService } from './fluke-factory.service.js';
import * as Sentry from '@sentry/electron/main';

/**
 * GVI Flow Meter Calibration Service
 * Handles the business logic for GVI flow meter calibration
 */
export class GVICalibrationService {
  constructor(sendToRenderer, showLogOnScreen) {
    this.sendToRenderer = sendToRenderer;
    this.showLogOnScreen = showLogOnScreen;
    this.config = null;
    this.isRunning = false;
    this.isCalibrationActive = false;
    this.startTime = null;
    this.flukeFactory = new FlukeFactoryService();
    this.fluke = null;
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
  async initialize(config) {
    try {
      this.config = config;
      this.isRunning = false;
      this.isCalibrationActive = false;
      this.startTime = null;
      this.currentStep = 0;
      this.steps = [];
      this.results = null;

      // Initialize Fluke service
      this.fluke = this.flukeFactory.getFlukeService(this.showLogOnScreen, () => this.isCalibrationActive);

      // this.showLogOnScreen('GVI Calibration Service initialized');
      // this.showLogOnScreen(`Model: ${config.model}`);
      // this.showLogOnScreen(`Serial Number: ${config.serialNumber}`);
      // this.showLogOnScreen(`Tester: ${config.tester}`);

      return { success: true };
    } catch (error) {
      console.error('Failed to initialize GVI calibration service:', error);
      Sentry.captureException(error);
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
      // Run prerequisites
      await this.runFlukePreReqs();
      await this.checkZeroPressure();
      await this.waitForFluke();

      // Start the first calibration step
      await this.runCalibrationSteps();

      this.showLogOnScreen('✅ Calibration process started - waiting for user interaction');
    } catch (error) {
      this.showLogOnScreen(`❌ Calibration process failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  // Stop calibration functionality not implemented yet for GVI module

  /**
   * Complete calibration with final result (PASS/FAIL)
   */
  async completeCalibrationWithResult(passed) {
    try {
      this.showLogOnScreen(`🎯 Completing calibration - Result: ${passed ? 'PASS' : 'FAIL'}`);

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
      await this.setFlukeToZero();
      await this.waitForFluke();

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
  async runFlukePreReqs() {
    await this.executeWithLogging('Fluke prerequisites', () => this.fluke.runPreReqs());
  }

  async checkZeroPressure() {
    this.showLogOnScreen('🔍 Checking zero pressure...');
    try {
      await this.fluke.setZeroPressureToFluke();
      await this.fluke.waitForFlukeToReachZeroPressure();
      this.showLogOnScreen('✅ Zero pressure confirmed');
    } catch (error) {
      this.showLogOnScreen(`❌ Zero pressure check failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  async waitForFluke() {
    try {
      await this.executeWithLogging('Waiting for Fluke', () => this.fluke.waitForFlukeToReachZeroPressure());
    } catch (error) {
      this.showLogOnScreen(`❌ Wait for Fluke failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  async runCalibrationSteps() {
    this.showLogOnScreen('🔧 Starting calibration steps...');

    // Process the first step
    await this.processNextStep();
  }

  async processNextStep() {
    console.log(`GVI Service - processNextStep called, currentStep: ${this.currentStep}, totalSteps: ${this.steps.length}`);

    if (this.currentStep >= this.steps.length) {
      this.showLogOnScreen('✅ All calibration steps completed');
      return;
    }

    const step = this.steps[this.currentStep];
    console.log(`GVI Service - processing step:`, step);
    this.showLogOnScreen(`Step ${this.currentStep + 1}/${this.steps.length}: ${step.gpm} GPM`);

    // Set pressure for this step
    await this.setPressureForStep(step);

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
    const pressure = step.psiMin;
    await this.fluke.setHighPressureToFluke(pressure);
    await this.fluke.waitForFlukeToReachTargetPressure(pressure);
    this.showLogOnScreen(`✅ Pressure set to ${pressure} PSI for ${step.gpm} GPM`);
  }

  async setFlukeToZero() {
    if (this.fluke) {
      await this.fluke.setZeroPressureToFluke();
      this.showLogOnScreen('🔧 Fluke set to zero pressure');
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
    this.logCalibrationInfo();
  }

  validateConfiguration() {
    if (!this.testerName || !this.model || !this.serialNumber) {
      throw new Error('Missing required calibration parameters');
    }
    if (!this.steps || this.steps.length === 0) {
      throw new Error('No calibration steps defined');
    }
  }

  logCalibrationInfo() {
    const info = [`🔧 Model: ${this.model}`, `🔢 Serial number: ${this.serialNumber}`, `👤 Tester: ${this.testerName}`, `📊 Total steps: ${this.steps.length}`];
    info.forEach(msg => this.showLogOnScreen(msg));
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

  async cleanup() {
    try {
      this.showLogOnScreen('🧹 Cleaning up GVI calibration service...');
      // Reset state (no stop functionality yet)
      if (this.isCalibrationActive) {
        this.isCalibrationActive = false;
      }
      this.reset();
      this.showLogOnScreen('✅ GVI calibration service cleanup completed');
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
