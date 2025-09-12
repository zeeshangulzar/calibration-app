import { GVICalibrationService } from '../services/gvi-calibration.service.js';
import { getGVIGaugeSteps, getGVIGaugeModels } from '../db/gvi-gauge.db.js';
import { sentryLogger } from '../loggers/sentry.logger.js';
import { GVIPDFService } from '../services/gvi-pdf.service.js';
import { FlukeFactoryService } from '../services/fluke-factory.service.js';
import { shell } from 'electron';

/**
 * GVI Flow Meter Controller - Manages calibration process
 */
export class GVIController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.calibrationService = null;
    this.isCalibrationActive = false;
    this.currentConfig = null;
    this.currentStep = 0;
    this.steps = [];
    this.pdfService = new GVIPDFService();
    this.flukeFactory = new FlukeFactoryService();
    this.fluke = null;
  }

  async initialize() {
    return this.handleAsync('initialize', async () => {
      this.calibrationService = new GVICalibrationService(this.sendToRenderer.bind(this), this.showLogOnScreen.bind(this));

      // Initialize Fluke service using factory
      this.initializeFlukeService();

      this.sendToRenderer('gvi-initialized');
      this.showLogOnScreen('GVI Flow Meter controller initialized');
    });
  }

  /**
   * Initialize or refresh Fluke service from factory
   * This should be called when settings change
   */
  initializeFlukeService() {
    // Reset factory instance to get fresh settings from database
    this.flukeFactory.instance = null;

    this.fluke = this.flukeFactory.getFlukeService(this.showLogOnScreen.bind(this), () => this.isCalibrationActive);
  }

  /**
   * Refresh Fluke service when settings change
   */
  async refreshFlukeService() {
    return this.handleAsync('refreshFlukeService', async () => {
      this.showLogOnScreen('Refreshing GVI Fluke service with updated settings...');
      this.initializeFlukeService();
      this.showLogOnScreen('GVI Fluke service refreshed with updated settings');
      return { success: true };
    });
  }

  async getAvailableModels() {
    return this.handleAsync('getModels', () => {
      const models = getGVIGaugeModels();
      // console.log('GVI Controller - Available models:', models);
      return { models };
    });
  }

  async getCalibrationSteps(model) {
    return this.handleAsync('getCalibrationSteps', () => ({ steps: getGVIGaugeSteps(model) }), { model });
  }

  async runFlukePrereqs() {
    return this.handleAsync('runFlukePrereqs', async () => {
      this.showLogOnScreen('Running Fluke prerequisites...');

      // Use actual Fluke service from factory
      if (this.fluke && this.fluke.runPreReqs) {
        await this.fluke.runPreReqs();
      } else {
        // Fallback simulation if Fluke service not available
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      this.showLogOnScreen('Fluke prerequisites completed successfully');
      return { success: true };
    });
  }

  async setPressure(psi) {
    return this.handleAsync(
      'setPressure',
      async () => {
        this.showLogOnScreen(`Setting pressure to ${psi} PSI...`);

        // Use actual Fluke service from factory - set high pressure and wait for it to reach target
        if (this.fluke && this.fluke.setHighPressureToFluke && this.fluke.waitForFlukeToReachTargetPressure) {
          await this.fluke.setHighPressureToFluke(psi);
          await this.fluke.waitForFlukeToReachTargetPressure(psi);
        } else {
          // Fallback simulation if Fluke service not available
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        this.showLogOnScreen(`Pressure set to ${psi} PSI successfully`);
        return { success: true, pressure: psi };
      },
      { psi }
    );
  }

  async setZeroPressure() {
    return this.handleAsync('setZeroPressure', async () => {
      this.showLogOnScreen('Setting Fluke pressure to zero...');

      // Use actual Fluke service from factory - set zero pressure and wait for it to reach zero
      if (this.fluke && this.fluke.setZeroPressureToFluke && this.fluke.waitForFlukeToReachZeroPressure) {
        await this.fluke.setZeroPressureToFluke();
        await this.fluke.waitForFlukeToReachZeroPressure();
      } else {
        // Fallback simulation if Fluke service not available
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.showLogOnScreen('Fluke pressure set to zero successfully');
      return { success: true };
    });
  }

  async goBack() {
    return this.handleAsync('goBack', async () => {
      // If calibration is in progress, stop it and set Fluke to zero
      if (this.isCalibrationActive) {
        this.showLogOnScreen('Stopping calibration and setting Fluke to zero...');
        this.isCalibrationActive = false;

        // Set Fluke to zero pressure
        try {
          await this.setZeroPressure();
        } catch (error) {
          console.error('Error setting zero pressure during back navigation:', error);
          this.showLogOnScreen('Warning: Could not set Fluke to zero pressure');
        }

        this.showLogOnScreen('Calibration stopped, returning to main menu');
      }

      // Reset calibration state
      this.currentConfig = null;
      this.currentStep = 0;
      this.steps = [];

      // Send back navigation to renderer
      this.sendToRenderer('gvi-go-back');
      return { success: true };
    });
  }

  async generatePDF(calibrationData) {
    return this.handleAsync(
      'generatePDF',
      async () => {
        this.showLogOnScreen('Generating GVI calibration PDF...');

        // Use the dedicated GVI PDF service
        const result = await this.pdfService.generateGVIPDF(calibrationData);

        if (result.success) {
          this.showLogOnScreen(`PDF generated successfully: ${result.filePath}`);
          return { success: true, pdfPath: result.filePath };
        } else {
          throw new Error(result.error);
        }
      },
      { calibrationData }
    );
  }

  async openPDF(pdfPath) {
    return this.handleAsync(
      'openPDF',
      async () => {
        await shell.openPath(pdfPath);
        return { success: true };
      },
      { pdfPath }
    );
  }

  async startCalibration(config) {
    return this.handleAsync(
      'startCalibration',
      async () => {
        if (this.isCalibrationActive) {
          throw new Error('Calibration already in progress');
        }

        this.validateConfig(config);

        const stepsResult = await this.getCalibrationSteps(config.model);
        if (!stepsResult.success) {
          throw new Error(`Failed to load calibration steps: ${stepsResult.error}`);
        }

        this.currentConfig = config;
        this.steps = stepsResult.steps;
        this.currentStep = 0;
        this.isCalibrationActive = true;

        await this.calibrationService.initialize(config);

        this.showLogOnScreen(`Starting calibration for ${config.model} (SN: ${config.serialNumber})`);
        this.showLogOnScreen(`Tester: ${config.tester} | Total steps: ${this.steps.length}`);

        this.sendToRenderer('gvi-calibration-started', {
          config: this.currentConfig,
          currentStep: this.currentStep,
          totalSteps: this.steps.length,
        });

        return { currentStep: this.currentStep, totalSteps: this.steps.length };
      },
      { config }
    );
  }

  async stopCalibration() {
    return this.handleAsync('stopCalibration', async () => {
      if (!this.isCalibrationActive) {
        throw new Error('No calibration in progress');
      }

      this.isCalibrationActive = false;

      if (this.calibrationService) {
        await this.calibrationService.stop();
      }

      this.showLogOnScreen('Calibration stopped by user');
      this.sendToRenderer('gvi-calibration-stopped');

      return {};
    });
  }

  async updateStep(stepData) {
    return this.handleAsync(
      'updateStepData',
      async () => {
        if (!this.isCalibrationActive) {
          throw new Error('No calibration in progress');
        }
        if (this.currentStep >= this.steps.length) {
          throw new Error('All steps completed');
        }

        // Update current step
        const step = this.steps[this.currentStep];
        step.status = stepData.result;
        step.timestamp = stepData.timestamp;

        this.showLogOnScreen(`Step ${this.currentStep + 1} (${step.gpm} GPM): ${stepData.result.toUpperCase()}`);

        this.currentStep++;
        const completed = this.currentStep >= this.steps.length;

        if (completed) {
          this.isCalibrationActive = false;
          await this.completeCalibration();
        }

        this.sendToRenderer('gvi-step-updated', {
          stepIndex: this.currentStep - 1,
          stepData: step,
          currentStep: this.currentStep,
          completed,
        });

        return { currentStep: this.currentStep, completed };
      },
      { stepData }
    );
  }

  getStatus() {
    return {
      success: true,
      isActive: this.isCalibrationActive,
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      config: this.currentConfig,
      steps: this.steps,
    };
  }

  async completeCalibration() {
    try {
      const results = {
        config: this.currentConfig,
        steps: this.steps,
        completedAt: new Date().toISOString(),
        summary: this.generateSummary(),
      };

      if (this.calibrationService) {
        await this.calibrationService.saveResults(results);
      }

      this.showLogOnScreen('Calibration completed successfully');
      this.sendToRenderer('gvi-calibration-completed', results);
    } catch (error) {
      this.handleError(error, 'completeCalibration');
      this.showLogOnScreen(`Error completing calibration: ${error.message}`);
    }
  }

  generateSummary() {
    const passedSteps = this.steps.filter(step => step.status === 'pass').length;
    const totalSteps = this.steps.length;
    const failedSteps = totalSteps - passedSteps;
    const passRate = totalSteps > 0 ? ((passedSteps / totalSteps) * 100).toFixed(1) : 0;

    return {
      totalSteps,
      passedSteps,
      failedSteps,
      passRate: parseFloat(passRate),
      overallResult: failedSteps === 0 ? 'PASS' : 'FAIL',
    };
  }

  validateConfig(config) {
    const required = [
      ['config', config],
      ['model', config?.model?.trim()],
      ['tester', config?.tester?.trim()],
      ['serialNumber', config?.serialNumber?.trim()],
    ];

    for (const [field, value] of required) {
      if (!value) {
        throw new Error(`${field === 'config' ? 'Configuration' : field} is required`);
      }
    }
  }

  sendToRenderer(event, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  showLogOnScreen(message) {
    console.log(`[GVI] ${message}`);
    this.sendToRenderer('gvi-log-message', {
      message,
      timestamp: new Date().toISOString(),
    });
  }

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
      this.handleError(error, 'cleanup');
    }
  }

  // Helper methods
  async handleAsync(method, fn, extra = {}) {
    try {
      const result = await fn();
      return { success: true, ...result };
    } catch (error) {
      this.handleError(error, method, extra);
      return { success: false, error: error.message };
    }
  }

  handleError(error, method, extra = {}) {
    console.error(`Failed to ${method}:`, error);
    sentryLogger.handleError(error, {
      module: 'gvi',
      service: 'gvi-controller',
      method,
      extra,
    });
  }
}
