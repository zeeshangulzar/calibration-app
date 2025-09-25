import { GVICalibrationService } from '../services/gvi-calibration.service.js';
import { getGVIGaugeSteps, getGVIGaugeModels } from '../db/gvi-gauge.db.js';
import { getGVIPDFService } from '../services/gvi-pdf.service.js';
import { getGVICalibrationState } from '../../state/gvi-calibration-state.service.js';
import { gviReportsDb } from '../db/gvi-reports.db.js';
import { sentryLogger } from '../loggers/sentry.logger.js';
import { shell } from 'electron';

/**
 * GVI Flow Meter Controller - Manages calibration process
 */
export class GVIController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.calibrationService = null;
    this.pdfService = getGVIPDFService();
    this.state = getGVICalibrationState();
    this.currentReportId = null; // Store current report ID for PDF path update

    this.setupEventListeners();
  }

  setupEventListeners() {
    // State events
    this.state.on('calibrationStarted', data => {
      this.sendToRenderer('gvi-calibration-started', data);
    });

    this.state.on('calibrationCompleted', data => {
      this.sendToRenderer('gvi-calibration-completed', data);
    });
  }

  async initialize() {
    try {
      // Initialize calibration service with proper dependency injection
      this.calibrationService = new GVICalibrationService(this.state, this.sendToRenderer.bind(this), this.showLogOnScreen.bind(this));

      await this.calibrationService.initialize();

      this.sendToRenderer('gvi-initialized');
      this.showLogOnScreen('GVI Flow Meter controller initialized');
    } catch (error) {
      this.handleError('initialize', error, 'Failed to initialize GVI system');
    }
  }

  async getAvailableModels() {
    try {
      const models = getGVIGaugeModels();
      return { success: true, models };
    } catch (error) {
      this.handleError('getAvailableModels', error);
      return { success: false, error: error.message };
    }
  }

  async getCalibrationSteps(model) {
    try {
      const steps = getGVIGaugeSteps(model);
      return { success: true, steps };
    } catch (error) {
      this.handleError('getCalibrationSteps', error, null, { model });
      return { success: false, error: error.message };
    }
  }

  async stopCalibration() {
    try {
      // Stop the calibration process
      if (this.calibrationService) {
        await this.calibrationService.stopCalibration();
        // Set Fluke to zero
      }

      // Update state
      if (this.state) {
        this.state.updateCalibrationStatus(false);
      }

      // Reset calibration state
      this.state.setCurrentConfig(null);
      this.calibrationService.cleanup();
      // Send notification to renderer
      this.sendToRenderer('gvi-calibration-stopped');

      return { success: true };
    } catch (error) {
      this.handleError('stopCalibration', error);
      return { success: false, error: error.message };
    }
  }

  async goBack() {
    try {
      // If calibration is in progress, stop it and disconnect Fluke
      if (this.state && this.state.isCalibrationActive) {
        this.state.updateCalibrationStatus(false);

        // Stop the calibration process first
        if (this.calibrationService) {
          await this.calibrationService.stopCalibration();

          // Clean up calibration service and disconnect Fluke
          await this.calibrationService.cleanup();
          // Reset FlukeFactory instance to ensure clean state for next use
          this.calibrationService.flukeFactory.resetInstance();
        }
      }

      // Reset calibration state (but don't destroy the state service)
      if (this.state) {
        this.state.setCurrentConfig(null);
        this.state.reset();
      }

      // Send back navigation to renderer
      this.sendToRenderer('gvi-go-back');
      return { success: true };
    } catch (error) {
      this.handleError('goBack', error);
      return { success: false, error: error.message };
    }
  }

  async generatePDF(calibrationData) {
    try {
      // Use the dedicated GVI PDF service
      const result = await this.pdfService.generateGVIPDF(calibrationData);

      if (result.success) {
        // Update the report with PDF path if we have a current report ID
        if (this.currentReportId) {
          this.updateReportWithPdfPath(result.filePath);
        }

        return { success: true, pdfPath: result.filePath };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.handleError('generatePDF', error, null, { calibrationData });
      return { success: false, error: error.message };
    }
  }

  async openPDF(pdfPath) {
    try {
      await shell.openPath(pdfPath);
      return { success: true };
    } catch (error) {
      this.handleError('openPDF', error, null, { pdfPath });
      return { success: false, error: error.message };
    }
  }

  async startCalibration(config) {
    try {
      if (this.state.isCalibrationActive) {
        throw new Error('Calibration already in progress');
      }

      // Reset current report ID for new calibration
      this.currentReportId = null;

      this.validateConfig(config);

      const stepsResult = await this.getCalibrationSteps(config.model);
      if (!stepsResult.success) {
        throw new Error(`Failed to load calibration steps: ${stepsResult.error}`);
      }

      // Set state in state service
      this.state.setCurrentConfig(config);
      this.state.startCalibration(config.model, config.tester, config.serialNumber, stepsResult.steps);

      let result;
      try {
        result = await this.calibrationService.startCalibration(config.tester, config.model, config.serialNumber, stepsResult.steps);
      } catch (error) {
        this.state.updateCalibrationStatus(false);
        this.handleError('startCalibration', error);
        return { success: false, error: error.message };
      }

      if (!result.success) {
        this.state.updateCalibrationStatus(false);

        // Check if it's a Fluke connectivity error
        if (result.error && (result.error.includes('Not connected to Fluke device') || result.error.includes('Fluke connection failed'))) {
          this.sendToRenderer('gvi-calibration-failed', {
            error: 'Calibration failed: Fluke connection failed - calibration cannot proceed',
          });
          return { success: false, error: 'Calibration failed: Fluke connection failed - calibration cannot proceed' };
        }

        // Check if it's a Fluke timeout error
        if (result.error && result.error.includes('Fluke is Busy: Response timed out')) {
          this.sendToRenderer('gvi-calibration-failed', {
            error: 'Calibration failed: Fluke device is busy or not responding - please try again',
          });
          return { success: false, error: 'Calibration failed: Fluke device is busy or not responding - please try again' };
        }

        throw new Error(result.error);
      }

      this.sendToRenderer('gvi-calibration-started', {
        config: this.state.getCurrentConfig(),
        currentStep: this.state.currentStepIndex,
        totalSteps: this.state.totalSteps,
      });

      return { success: true, currentStep: this.state.currentStepIndex, totalSteps: this.state.totalSteps };
    } catch (error) {
      this.handleError('startCalibration', error, null, { config });
      return { success: false, error: error.message };
    }
  }

  async nextStep() {
    try {
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

      return { success: true, completed: result.completed };
    } catch (error) {
      this.handleError('nextStep', error);
      return { success: false, error: error.message };
    }
  }

  async handleFinalResult(passed) {
    try {
      if (!this.state.isCalibrationActive) {
        throw new Error('No calibration in progress');
      }

      const result = await this.calibrationService.handleFinalResult(passed);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Save calibration report to database (background operation)
      this.saveCalibrationReport(passed);

      this.state.updateCalibrationStatus(false);
      return { success: true };
    } catch (error) {
      this.handleError('handleFinalResult', error, null, { passed });
      return { success: false, error: error.message };
    }
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
      this.handleError('getStatus', error);
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
          this.handleError('validateConfig', error, null, { config, field, value });
          throw error;
        }
      }
    } catch (error) {
      this.handleError('validateConfig', error, null, { config });
    }
  }

  sendToRenderer(event, data = null) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(event, data);
      }
    } catch (error) {
      this.handleError('sendToRenderer', error, null, { event, data });
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
      this.handleError('showLogOnScreen', error, null, { message });
    }
  }

  async cleanup() {
    try {
      console.log('[Controller] Starting GVI cleanup...');

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

      this.state = this.pdfService = this.mainWindow = null;
      console.log('[Controller] GVI cleanup completed');
    } catch (error) {
      this.handleError('cleanup', error);
    }
  }

  /**
   * Save calibration report to database (background operation)
   */
  async saveCalibrationReport(passed) {
    try {
      const state = this.state.getState();
      const model = state.model;
      const status = passed ? 'PASS' : 'FAIL';

      if (!model) {
        console.warn('[GVI Controller] Cannot save report: model not available');
        return;
      }

      // Create report without PDF location initially
      const result = gviReportsDb.createReport(model, status);

      if (result.success) {
        this.currentReportId = result.reportId; // Store report ID for PDF path update
        console.log(`[GVI Controller] Report saved: ID ${result.reportId}, Model: ${model}, Status: ${status}`);
      } else {
        console.error('[GVI Controller] Failed to save report:', result.error);
      }
    } catch (error) {
      console.error('[GVI Controller] Error saving calibration report:', error);
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-controller',
        method: 'saveCalibrationReport',
      });
    }
  }

  /**
   * Update report with PDF path (background operation)
   */
  async updateReportWithPdfPath(pdfPath) {
    try {
      if (!this.currentReportId) {
        console.warn('[GVI Controller] Cannot update report: no current report ID');
        return;
      }

      const result = gviReportsDb.updateReportPdfLocation(this.currentReportId, pdfPath);

      if (result.success) {
        console.log(`[GVI Controller] Report updated with PDF path: ID ${this.currentReportId}, Path: ${pdfPath}`);
      } else {
        console.error('[GVI Controller] Failed to update report PDF path:', result.error);
      }
    } catch (error) {
      console.error('[GVI Controller] Error updating report PDF path:', error);
      // Don't throw error - this is a background operation
    }
  }

  handleError(method, error, userMessage = null, extra = {}) {
    sentryLogger.handleError(error, {
      module: 'gvi',
      service: 'gvi-controller',
      method,
      extra,
    });
    console.error(`Error in ${method}:`, error);

    if (userMessage) {
      this.sendToRenderer('gvi-error', { message: userMessage });
    }
  }
}
