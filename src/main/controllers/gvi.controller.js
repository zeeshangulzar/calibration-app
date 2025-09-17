import { GVICalibrationService } from '../services/gvi-calibration.service.js';
import { getGVIGaugeSteps, getGVIGaugeModels } from '../db/gvi-gauge.db.js';
import { sentryLogger } from '../loggers/sentry.logger.js';
import { GVIPDFService } from '../services/gvi-pdf.service.js';
import { FlukeFactoryService } from '../services/fluke-factory.service.js';
import { getGVICalibrationState } from '../../state/gvi-calibration-state.service.js';
import { shell } from 'electron';

/**
 * GVI Flow Meter Controller - Manages calibration process
 */
export class GVIController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.calibrationService = null;
    this.pdfService = new GVIPDFService();
    this.flukeFactory = new FlukeFactoryService();
    this.fluke = null;

    // Get state service instance
    this.state = getGVICalibrationState();
    this.state.setMainWindow(mainWindow);
    this.state.setController(this);
    this.state.setServices(this.pdfService, this.flukeFactory, this.fluke);
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
    try {
      // Reset factory instance to get fresh settings from database
      this.flukeFactory = new FlukeFactoryService();

      this.fluke = this.flukeFactory.getFlukeService(this.showLogOnScreen.bind(this), () => this.state.isCalibrationActive);
    } catch (error) {
      this.handleError(error, 'initializeFlukeService');
    }
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
      if (this.state.isCalibrationActive) {
        this.showLogOnScreen('Resetting calibration state...');
        this.state.updateCalibrationStatus(false);
        this.showLogOnScreen('Calibration state reset, returning to main menu');
      }

      // Reset calibration state
      this.state.setCurrentConfig(null);
      this.state.reset();

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
        if (this.state.isCalibrationActive) {
          throw new Error('Calibration already in progress');
        }

        this.validateConfig(config);

        const stepsResult = await this.getCalibrationSteps(config.model);
        if (!stepsResult.success) {
          throw new Error(`Failed to load calibration steps: ${stepsResult.error}`);
        }

        // Set state in state service
        this.state.setCurrentConfig(config);
        this.state.startCalibration(config.model, config.tester, config.serialNumber, stepsResult.steps);

        await this.calibrationService.initialize(config);

        this.showLogOnScreen(`Starting calibration for ${config.model} (SN: ${config.serialNumber})`);
        // this.showLogOnScreen(`Tester: ${config.tester} | Total steps: ${this.state.totalSteps}`);

        const result = await this.calibrationService.startCalibration(config.tester, config.model, config.serialNumber, stepsResult.steps);

        if (!result.success) {
          this.state.updateCalibrationStatus(false);

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
          config: this.state.getCurrentConfig(),
          currentStep: this.state.currentStepIndex,
          totalSteps: this.state.totalSteps,
        });

        return { currentStep: this.state.currentStepIndex, totalSteps: this.state.totalSteps };
      },
      { config }
    );
  }

  // Stop calibration functionality not implemented yet for GVI module

  async updateStep(stepData) {
    return this.handleAsync(
      'updateStepData',
      async () => {
        if (!this.state.isCalibrationActive) {
          throw new Error('No calibration in progress');
        }

        const result = await this.calibrationService.processStep(stepData);

        if (!result.success) {
          throw new Error(result.error);
        }

        // Update state service
        if (result.completed) {
          this.state.updateCalibrationStatus(false);
        }

        return { currentStep: this.state.currentStepIndex, completed: result.completed };
      },
      { stepData }
    );
  }

  async nextStep() {
    return this.handleAsync('nextStep', async () => {
      if (!this.state.isCalibrationActive) {
        throw new Error('No calibration in progress');
      }

      const result = await this.calibrationService.nextStep();

      if (!result.success) {
        throw new Error(result.error);
      }

      if (result.completed) {
        this.state.updateCalibrationStatus(false);
      }

      return { completed: result.completed };
    });
  }

  async handleFinalResult(passed) {
    return this.handleAsync(
      'handleFinalResult',
      async () => {
        if (!this.state.isCalibrationActive) {
          throw new Error('No calibration in progress');
        }

        const result = await this.calibrationService.handleFinalResult(passed);

        if (!result.success) {
          throw new Error(result.error);
        }

        this.state.updateCalibrationStatus(false);
        return { success: true };
      },
      { passed }
    );
  }

  getStatus() {
    try {
      const state = this.state.getState();
      return {
        success: true,
        isActive: state.isCalibrationActive,
        currentStep: state.currentStepIndex,
        totalSteps: state.totalSteps,
        config: state.currentConfig,
        steps: state.calibrationSteps,
      };
    } catch (error) {
      this.handleError(error, 'getStatus');
      return {
        success: false,
        error: error.message,
        isActive: false,
        currentStep: 0,
        totalSteps: 0,
        config: null,
        steps: [],
      };
    }
  }

  // Calibration completion is now handled by the calibration service

  validateConfig(config) {
    try {
      const required = [
        ['config', config],
        ['model', config?.model?.trim()],
        ['tester', config?.tester?.trim()],
        ['serialNumber', config?.serialNumber?.trim()],
      ];

      for (const [field, value] of required) {
        if (!value) {
          const error = new Error(`${field === 'config' ? 'Configuration' : field} is required`);
          this.handleError(error, 'validateConfig', { config, field, value });
          throw error;
        }
      }
    } catch (error) {
      this.handleError(error, 'validateConfig', { config });
    }
  }

  sendToRenderer(event, data = null) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(event, data);
      }
    } catch (error) {
      this.handleError(error, 'sendToRenderer', { event, data });
    }
  }

  showLogOnScreen(message) {
    try {
      console.log(`[GVI] ${message}`);
      this.sendToRenderer('gvi-log-message', {
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError(error, 'showLogOnScreen', { message });
    }
  }

  async cleanup() {
    try {
      // Reset calibration state (no stop functionality yet)
      if (this.state.isCalibrationActive) {
        this.state.updateCalibrationStatus(false);
      }
      if (this.calibrationService) {
        await this.calibrationService.cleanup();
        this.calibrationService = null;
      }

      // Cleanup state service
      await this.state.cleanup();

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
