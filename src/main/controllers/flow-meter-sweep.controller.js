import { FlowMeterSweepService } from '../services/flow-meter-sweep.service.js';
import { getFlowMeterModels, getFlowMeterById } from '../db/flow-meter.db.js';
import { getFlowMeterSweepState } from '../../state/flow-meter-sweep-state.service.js';
import { sentryLogger } from '../loggers/sentry.logger.js';

/**
 * Flow Meter Sweep Controller - Manages sweep process
 */
export class FlowMeterSweepController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.sweepService = null;
    this.state = getFlowMeterSweepState();

    this.setupEventListeners();
  }

  setupEventListeners() {
    // State events
    this.state.on('sweepStarted', data => {
      this.sendToRenderer('flow-meter-sweep-started', data);
    });
  }

  async initialize() {
    try {
      // Initialize sweep service with proper dependency injection
      this.sweepService = new FlowMeterSweepService(this.state, this.sendToRenderer.bind(this), this.showLogOnScreen.bind(this));

      await this.sweepService.initialize();

      this.sendToRenderer('flow-meter-sweep-initialized');
      this.showLogOnScreen('Flow meter sweep controller initialized');
    } catch (error) {
      this.handleError('initialize', error, 'Failed to initialize flow meter sweep system');
    }
  }

  async getAvailableFlowMeters() {
    try {
      const flowMeters = getFlowMeterModels();
      return { success: true, flowMeters };
    } catch (error) {
      this.handleError('getAvailableFlowMeters', error);
      return { success: false, error: error.message };
    }
  }

  async getPressureRanges(flowMeterId) {
    try {
      const flowMeter = getFlowMeterById(flowMeterId);
      if (!flowMeter) {
        throw new Error('Flow meter not found');
      }

      return {
        success: true,
        pressureRanges: {
          increasing: flowMeter.increasing_pressure,
          decreasing: flowMeter.decreasing_pressure,
        },
      };
    } catch (error) {
      this.handleError('getPressureRanges', error, null, { flowMeterId });
      return { success: false, error: error.message };
    }
  }

  async goBack() {
    try {
      // If sweep is in progress, just reset state
      if (this.state.isSweepActive) {
        this.state.updateSweepStatus(false);
      }

      // Reset sweep state
      this.state.setCurrentConfig(null);
      this.state.reset();

      // Send back navigation to renderer
      this.sendToRenderer('flow-meter-sweep-go-back');
      return { success: true };
    } catch (error) {
      this.handleError('goBack', error);
      return { success: false, error: error.message };
    }
  }

  async startSweep(config) {
    try {
      if (this.state.isSweepActive) {
        throw new Error('Sweep already in progress');
      }

      this.validateConfig(config);

      // Get pressure ranges for the flow meter
      const rangesResult = await this.getPressureRanges(config.flowMeterId);
      if (!rangesResult.success) {
        throw new Error(`Failed to load pressure ranges: ${rangesResult.error}`);
      }

      // Set state in state service
      this.state.setCurrentConfig(config);
      this.state.startSweep(config.flowMeterId, rangesResult.pressureRanges);

      const result = await this.sweepService.startSweep({
        ...config,
        pressureRanges: rangesResult.pressureRanges,
      });

      if (!result.success) {
        this.state.updateSweepStatus(false);

        // Check if it's a Fluke connectivity error
        if (result.error && (result.error.includes('Not connected to Fluke device') || result.error.includes('Fluke connection failed'))) {
          this.sendToRenderer('flow-meter-sweep-failed', {
            error: 'Sweep failed: Fluke connection failed - sweep cannot proceed',
          });
          return { success: false, error: 'Sweep failed: Fluke connection failed - sweep cannot proceed' };
        }

        throw new Error(result.error);
      }

      this.sendToRenderer('flow-meter-sweep-started', {
        config: this.state.getCurrentConfig(),
        currentStep: this.state.currentStepIndex,
        totalSteps: this.state.totalSteps,
      });

      return { success: true, currentStep: this.state.currentStepIndex, totalSteps: this.state.totalSteps };
    } catch (error) {
      this.handleError('startSweep', error, null, { config });
      return { success: false, error: error.message };
    }
  }

  async nextStep() {
    try {
      if (!this.state.isSweepActive) {
        throw new Error('No sweep in progress');
      }

      const result = await this.sweepService.nextStep();

      if (!result.success) {
        throw new Error(result.error);
      }

      if (result.completed) {
        this.state.updateSweepStatus(false);
      } else {
        this.state.updateStepIndex(result.currentStep || this.state.currentStepIndex);
      }

      return { success: true, completed: result.completed };
    } catch (error) {
      this.handleError('nextStep', error);
      return { success: false, error: error.message };
    }
  }

  async completeSweep() {
    try {
      if (!this.state.isSweepActive) {
        throw new Error('No sweep in progress');
      }

      const result = await this.sweepService.completeSweep();

      if (!result.success) {
        throw new Error(result.error);
      }

      this.state.updateSweepStatus(false);
      return { success: true };
    } catch (error) {
      this.handleError('completeSweep', error);
      return { success: false, error: error.message };
    }
  }

  getStatus() {
    try {
      const state = this.state.getState();
      return {
        success: true,
        isActive: state.isSweepActive,
        currentStep: state.currentStepIndex,
        totalSteps: state.totalSteps,
        config: state.currentConfig,
        pressureRanges: state.pressureRanges,
        isIncreasingPhase: state.isIncreasingPhase,
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
        pressureRanges: { increasing: [], decreasing: [] },
        isIncreasingPhase: true,
      };
    }
  }

  validateConfig(config) {
    try {
      const required = [
        ['config', config],
        ['flowMeterId', config?.flowMeterId],
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
      console.log(`[Flow Meter Sweep] ${message}`);
      this.sendToRenderer('flow-meter-sweep-log-message', {
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleError('showLogOnScreen', error, null, { message });
    }
  }

  async cleanup() {
    try {
      console.log('[Controller] Starting flow meter sweep cleanup...');

      // Reset sweep state
      if (this.state.isSweepActive) {
        this.state.updateSweepStatus(false);
      }

      if (this.sweepService) {
        await this.sweepService.cleanup();
        this.sweepService = null;
      }

      // Cleanup state service
      await this.state.cleanup();

      this.state = this.mainWindow = null;
      console.log('[Controller] Flow meter sweep cleanup completed');
    } catch (error) {
      this.handleError('cleanup', error);
    }
  }

  handleError(method, error, userMessage = null, extra = {}) {
    sentryLogger.handleError(error, {
      module: 'flow-meter-sweep',
      service: 'flow-meter-sweep-controller',
      method,
      extra,
    });
    console.error(`Error in ${method}:`, error);

    if (userMessage) {
      this.sendToRenderer('flow-meter-sweep-error', { message: userMessage });
    }
  }
}
