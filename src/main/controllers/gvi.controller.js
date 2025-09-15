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
    this.flukeFactory = new FlukeFactoryService();

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

  async goBack() {
    return this.handleAsync('goBack', async () => {
      // If calibration is in progress, just reset state (no stop functionality yet)
      if (this.isCalibrationActive) {
        this.showLogOnScreen('Resetting calibration state...');
        this.isCalibrationActive = false;
        this.showLogOnScreen('Calibration state reset, returning to main menu');
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

        const result = await this.calibrationService.startCalibration(config.tester, config.model, config.serialNumber, this.steps);

        if (!result.success) {
          this.isCalibrationActive = false;

          // Check if it's a Fluke connectivity error
          if (result.error && (result.error.includes('Not connected to Fluke device') || result.error.includes('Fluke connection failed'))) {
            this.sendToRenderer('gvi-calibration-failed', {
              error: 'Calibration failed: Fluke connection failed - calibration cannot proceed',
            });
            return { success: false, error: 'Calibration failed: Fluke connection failed - calibration cannot proceed' };
          }

          throw new Error(result.error);
        }

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

  // Stop calibration functionality not implemented yet for GVI module

  async updateStep(stepData) {
    return this.handleAsync(
      'updateStepData',
      async () => {
        if (!this.isCalibrationActive) {
          throw new Error('No calibration in progress');
        }

        const result = await this.calibrationService.processStep(stepData);

        if (!result.success) {
          throw new Error(result.error);
        }

        // Update controller state
        this.currentStep = result.currentStep;
        if (result.completed) {
          this.isCalibrationActive = false;
        }

        return { currentStep: this.currentStep, completed: result.completed };
      },
      { stepData }
    );
  }

  async nextStep() {
    return this.handleAsync('nextStep', async () => {
      if (!this.isCalibrationActive) {
        throw new Error('No calibration in progress');
      }

      const result = await this.calibrationService.nextStep();

      if (!result.success) {
        throw new Error(result.error);
      }

      if (result.completed) {
        this.isCalibrationActive = false;
      }

      return { completed: result.completed };
    });
  }

  async handleFinalResult(passed) {
    return this.handleAsync(
      'handleFinalResult',
      async () => {
        if (!this.isCalibrationActive) {
          throw new Error('No calibration in progress');
        }

        const result = await this.calibrationService.handleFinalResult(passed);

        if (!result.success) {
          throw new Error(result.error);
        }

        this.isCalibrationActive = false;
        return { success: true };
      },
      { passed }
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

  // Calibration completion is now handled by the calibration service

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
      // Reset calibration state (no stop functionality yet)
      if (this.isCalibrationActive) {
        this.isCalibrationActive = false;
      }
      if (this.calibrationService) {
        await this.calibrationService.cleanup();
        this.calibrationService = null;
      }
      this.currentConfig = null;
      this.currentStep = 0;
      this.steps = [];
      this.fluke = null;
      this.flukeFactory = null;
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
