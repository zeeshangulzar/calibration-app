import { GVICalibrationService } from '../services/gvi-calibration.service.js';
import { getGVIGaugeSteps, getGVIGaugeModels } from '../db/index.js';
import * as Sentry from '@sentry/electron/main';

/**
 * GVI Flow Meter Controller
 * Manages the GVI flow meter calibration process
 */
export class GVIController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.calibrationService = null;
    this.isCalibrationActive = false;
    this.currentConfig = null;
    this.currentStep = 0;
    this.steps = [];
  }

  /**
   * Initialize the controller
   */
  async initialize() {
    try {
      this.calibrationService = new GVICalibrationService(
        this.sendToRenderer.bind(this),
        this.showLogOnScreen.bind(this)
      );

      this.sendToRenderer('gvi-initialized');
      this.showLogOnScreen('GVI Flow Meter controller initialized');
    } catch (error) {
      console.error('Failed to initialize GVI controller:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get available GVI gauge models from database
   */
  async getAvailableModels() {
    try {
      const models = getGVIGaugeModels();
      return { success: true, models };
    } catch (error) {
      console.error('Failed to get GVI models:', error);
      Sentry.captureException(error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Load calibration steps for a specific model from database
   */
  async getCalibrationSteps(model) {
    try {
      const steps = getGVIGaugeSteps(model);
      return { success: true, steps };
    } catch (error) {
      console.error('Failed to get calibration steps:', error);
      Sentry.captureException(error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start calibration process
   */
  async startCalibration(config) {
    try {
      if (this.isCalibrationActive) {
        return { success: false, error: 'Calibration already in progress' };
      }

      // Validate configuration
      const validation = this.validateConfig(config);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Load calibration steps from database instead of using config.steps
      const stepsResult = await this.getCalibrationSteps(config.model);
      if (!stepsResult.success) {
        return { success: false, error: `Failed to load calibration steps: ${stepsResult.error}` };
      }

      this.currentConfig = config;
      this.steps = stepsResult.steps;
      this.currentStep = 0;
      this.isCalibrationActive = true;

      // Initialize calibration service with config
      await this.calibrationService.initialize(config);

      this.showLogOnScreen(`Starting calibration for ${config.model} (SN: ${config.serialNumber})`);
      this.showLogOnScreen(`Tester: ${config.tester}`);
      this.showLogOnScreen(`Total steps: ${this.steps.length}`);

      // Send calibration started event
      this.sendToRenderer('gvi-calibration-started', {
        config: this.currentConfig,
        currentStep: this.currentStep,
        totalSteps: this.steps.length
      });

      return { 
        success: true, 
        currentStep: this.currentStep,
        totalSteps: this.steps.length
      };
    } catch (error) {
      this.isCalibrationActive = false;
      console.error('Failed to start GVI calibration:', error);
      Sentry.captureException(error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop calibration process
   */
  async stopCalibration() {
    try {
      if (!this.isCalibrationActive) {
        return { success: false, error: 'No calibration in progress' };
      }

      this.isCalibrationActive = false;
      
      if (this.calibrationService) {
        await this.calibrationService.stop();
      }

      this.showLogOnScreen('Calibration stopped by user');
      
      // Send calibration stopped event
      this.sendToRenderer('gvi-calibration-stopped');

      return { success: true };
    } catch (error) {
      console.error('Failed to stop GVI calibration:', error);
      Sentry.captureException(error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update calibration step
   */
  async updateStep(stepData) {
    try {
      if (!this.isCalibrationActive) {
        return { success: false, error: 'No calibration in progress' };
      }

      if (this.currentStep >= this.steps.length) {
        return { success: false, error: 'All steps completed' };
      }

      // Update current step with result
      this.steps[this.currentStep].status = stepData.result;
      this.steps[this.currentStep].timestamp = stepData.timestamp;

      const currentStepData = this.steps[this.currentStep];
      this.showLogOnScreen(`Step ${this.currentStep + 1} (${currentStepData.gpm} GPM): ${stepData.result.toUpperCase()}`);

      // Move to next step
      this.currentStep++;

      const completed = this.currentStep >= this.steps.length;
      
      if (completed) {
        this.isCalibrationActive = false;
        await this.completeCalibration();
      }

      // Send step update event
      this.sendToRenderer('gvi-step-updated', {
        stepIndex: this.currentStep - 1,
        stepData: this.steps[this.currentStep - 1],
        currentStep: this.currentStep,
        completed: completed
      });

      return { 
        success: true, 
        currentStep: this.currentStep,
        completed: completed
      };
    } catch (error) {
      console.error('Failed to update GVI step:', error);
      Sentry.captureException(error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current calibration status
   */
  getStatus() {
    return {
      success: true,
      isActive: this.isCalibrationActive,
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      config: this.currentConfig,
      steps: this.steps
    };
  }

  /**
   * Complete calibration process
   */
  async completeCalibration() {
    try {
      const results = {
        config: this.currentConfig,
        steps: this.steps,
        completedAt: new Date().toISOString(),
        summary: this.generateSummary()
      };

      // Save calibration results
      if (this.calibrationService) {
        await this.calibrationService.saveResults(results);
      }

      this.showLogOnScreen('Calibration completed successfully');
      
      // Send completion event
      this.sendToRenderer('gvi-calibration-completed', results);

    } catch (error) {
      console.error('Failed to complete GVI calibration:', error);
      Sentry.captureException(error);
      this.showLogOnScreen(`Error completing calibration: ${error.message}`);
    }
  }

  /**
   * Generate calibration summary
   */
  generateSummary() {
    const passedSteps = this.steps.filter(step => step.status === 'pass').length;
    const failedSteps = this.steps.filter(step => step.status === 'fail').length;
    const totalSteps = this.steps.length;
    
    const passRate = totalSteps > 0 ? (passedSteps / totalSteps * 100).toFixed(1) : 0;
    const overallResult = failedSteps === 0 ? 'PASS' : 'FAIL';

    return {
      totalSteps,
      passedSteps,
      failedSteps,
      passRate: parseFloat(passRate),
      overallResult
    };
  }

  /**
   * Validate calibration configuration
   */
  validateConfig(config) {
    if (!config) {
      return { valid: false, error: 'Configuration is required' };
    }

    if (!config.model || !config.model.trim()) {
      return { valid: false, error: 'Model is required' };
    }

    if (!config.tester || !config.tester.trim()) {
      return { valid: false, error: 'Tester is required' };
    }

    if (!config.serialNumber || !config.serialNumber.trim()) {
      return { valid: false, error: 'Serial number is required' };
    }

    // Steps are now loaded from database, not required in config

    return { valid: true };
  }

  /**
   * Send data to renderer process
   */
  sendToRenderer(event, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  /**
   * Show log message on screen
   */
  showLogOnScreen(message) {
    console.log(`[GVI] ${message}`);
    this.sendToRenderer('gvi-log-message', {
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Cleanup controller resources
   */
  async cleanup() {
    try {
      if (this.isCalibrationActive) {
        await this.stopCalibration();
      }

      if (this.calibrationService) {
        await this.calibrationService.cleanup();
        this.calibrationService = null;
      }

      this.currentConfig = null;
      this.currentStep = 0;
      this.steps = [];
      
      console.log('GVI controller cleaned up');
    } catch (error) {
      console.error('Error cleaning up GVI controller:', error);
      Sentry.captureException(error);
    }
  }
}
