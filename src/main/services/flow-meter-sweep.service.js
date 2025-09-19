import { FlukeFactoryService } from './fluke-factory.service.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Flow Meter Sweep Service
 * Handles the business logic for flow meter manual sweep
 */
export class FlowMeterSweepService {
  constructor(flowMeterSweepState, sendToRenderer, showLogOnScreen) {
    this.flowMeterSweepState = flowMeterSweepState;
    this.sendToRenderer = sendToRenderer;
    this.showLogOnScreen = showLogOnScreen;
    this.flukeFactory = new FlukeFactoryService();
    this.fluke = null;

    this.reset();
  }

  reset() {
    this.config = null;
    this.isSweepActive = false;
    this.currentStepIndex = 0;
    this.totalSteps = 0;
    this.pressureRanges = { increasing: [], decreasing: [] };
    this.isIncreasingPhase = true;
    this.fluke = null;
  }

  async initialize() {
    try {
      this.fluke = this.flukeFactory.getFlukeService(this.showLogOnScreen, () => this.flowMeterSweepState.isSweepActive);
      if (!this.fluke) {
        throw new Error('Failed to initialize Fluke device');
      }
      this.showLogOnScreen('Flow meter sweep service initialized');
      return { success: true };
    } catch (error) {
      this.handleError(error, 'initialize');
      throw error;
    }
  }

  async startSweep(config) {
    try {
      if (this.isSweepActive) {
        throw new Error('Sweep already in progress');
      }

      this.validateConfig(config);

      // Set up sweep configuration
      this.config = config;
      this.pressureRanges = config.pressureRanges;
      this.isSweepActive = true;
      this.currentStepIndex = 0;
      this.isIncreasingPhase = true;

      // Calculate total steps (increasing + decreasing)
      this.totalSteps = this.pressureRanges.increasing.length + this.pressureRanges.decreasing.length;

      if (this.totalSteps === 0) {
        throw new Error('No pressure ranges available for sweep');
      }

      this.showLogOnScreen(`Starting flow meter sweep with ${this.totalSteps} steps`);
      this.showLogOnScreen(`Increasing phase: ${this.pressureRanges.increasing.length} steps`);
      this.showLogOnScreen(`Decreasing phase: ${this.pressureRanges.decreasing.length} steps`);

      // Run the sweep process (connect to Fluke, run prerequisites, etc.)
      await this.runSweepProcess();

      return { success: true, currentStep: this.currentStepIndex, totalSteps: this.totalSteps };
    } catch (error) {
      // Reset state on error
      this.isSweepActive = false;
      this.handleError(error, 'startSweep');
      return { success: false, error: error.message };
    }
  }

  /**
   * Core sweep process - follows GVI pattern
   */
  async runSweepProcess() {
    try {
      // Connect to Fluke device first
      await this.connectToFluke();

      // Run prerequisites
      await this.runFlukePreReqs();
      await this.checkZeroPressure();
      await this.waitForFluke();

      // Start the first sweep step
      await this.executeCurrentStep();
    } catch (error) {
      // Cleanup Fluke connection on error
      await this.cleanupFlukeConnection();
      this.showLogOnScreen(`❌ Sweep process failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Connect to Fluke device
   */
  async connectToFluke() {
    try {
      await this.executeWithLogging('Connecting to Fluke device', async () => {
        const result = await this.fluke.connect();
        if (!result.success) {
          throw new Error(result.error || 'Failed to connect to Fluke device');
        }
      });
    } catch (error) {
      // If connection fails, try to cleanup and throw error
      await this.cleanupFlukeConnection();
      throw error;
    }
  }

  /**
   * Run Fluke prerequisites
   */
  async runFlukePreReqs() {
    await this.executeWithLogging('Fluke prerequisites', () => this.fluke.runPreReqs());
  }

  /**
   * Cleanup Fluke connection
   */
  async cleanupFlukeConnection() {
    try {
      if (this.fluke && this.fluke.telnetClient && this.fluke.telnetClient.isConnected) {
        this.showLogOnScreen('🧹 Cleaning up Fluke connection...');
        await this.fluke.telnetClient.disconnect();
        this.showLogOnScreen('✅ Fluke connection cleaned up');
      }
    } catch (error) {
      console.error('Error cleaning up Fluke connection:', error);
      // Don't throw error during cleanup
    }
  }

  /**
   * Check zero pressure
   */
  async checkZeroPressure() {
    try {
      await this.fluke.setZeroPressureToFluke();
      await this.fluke.waitForFlukeToReachZeroPressure(true);
      this.showLogOnScreen('✅ Zero pressure confirmed');
    } catch (error) {
      this.showLogOnScreen(`❌ Zero pressure check failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Wait for Fluke to be ready
   */
  async waitForFluke() {
    try {
      await this.fluke.waitForFlukeToReachZeroPressure();
    } catch (error) {
      this.showLogOnScreen(`❌ Wait for Fluke failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Execute operation with logging
   */
  async executeWithLogging(message, operation) {
    this.showLogOnScreen(`⚙️ ${message}...`);
    try {
      await operation();
      this.showLogOnScreen(`✅ ${message} completed`);
    } catch (error) {
      this.showLogOnScreen(`❌ ${message} failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  async nextStep() {
    try {
      if (!this.isSweepActive) {
        throw new Error('No sweep in progress');
      }

      this.currentStepIndex++;

      if (this.currentStepIndex >= this.totalSteps) {
        // Sweep completed
        this.isSweepActive = false;
        this.sendToRenderer('flow-meter-sweep-completed', {
          config: this.config,
          totalSteps: this.totalSteps,
        });
        return { success: true, completed: true };
      }

      // Check if we need to switch from increasing to decreasing phase
      if (this.isIncreasingPhase && this.currentStepIndex >= this.pressureRanges.increasing.length) {
        this.isIncreasingPhase = false;
        this.showLogOnScreen('Switching to decreasing pressure phase');
      }

      await this.executeCurrentStep();

      return { success: true, completed: false };
    } catch (error) {
      this.handleError(error, 'nextStep');
      return { success: false, error: error.message };
    }
  }

  async executeCurrentStep() {
    try {
      const currentPressure = this.getCurrentPressure();

      this.showLogOnScreen(`Step ${this.currentStepIndex + 1}/${this.totalSteps}: Setting pressure to ${currentPressure} PSI`);

      // Set pressure on Fluke
      await this.setFlukePressure(currentPressure);

      // Send step ready event to renderer
      this.sendToRenderer('flow-meter-sweep-step-ready', {
        currentStep: this.currentStepIndex + 1,
        totalSteps: this.totalSteps,
        step: {
          psi: currentPressure,
          phase: this.isIncreasingPhase ? 'increasing' : 'decreasing',
          stepIndex: this.currentStepIndex,
        },
      });

      return { success: true };
    } catch (error) {
      this.handleError(error, 'executeCurrentStep');
      throw error;
    }
  }

  getCurrentPressure() {
    if (this.isIncreasingPhase) {
      return this.pressureRanges.increasing[this.currentStepIndex];
    } else {
      const decreasingIndex = this.currentStepIndex - this.pressureRanges.increasing.length;
      return this.pressureRanges.decreasing[decreasingIndex];
    }
  }

  async setFlukePressure(pressure) {
    try {
      if (pressure === 0) {
        await this.fluke.setZeroPressureToFluke();
      } else {
        await this.fluke.setHighPressureToFluke(pressure);
      }

      // Wait for pressure to stabilize
      await this.fluke.waitForFlukeToReachTargetPressure(pressure);

      this.showLogOnScreen(`Pressure set to ${pressure} PSI`);
    } catch (error) {
      this.handleError(error, 'setFlukePressure');
      throw error;
    }
  }

  async completeSweep() {
    try {
      if (!this.isSweepActive) {
        throw new Error('No sweep in progress');
      }

      // Set Fluke to zero pressure
      await this.fluke.setZeroPressureToFluke();

      this.isSweepActive = false;
      this.showLogOnScreen('Sweep completed successfully');

      return { success: true };
    } catch (error) {
      this.handleError(error, 'completeSweep');
      return { success: false, error: error.message };
    }
  }

  isActive = () => this.isSweepActive;

  getStatus() {
    return {
      isSweepActive: this.isSweepActive,
      currentStep: this.currentStepIndex,
      totalSteps: this.totalSteps,
      config: this.config,
      isIncreasingPhase: this.isIncreasingPhase,
    };
  }

  validateConfig(config) {
    const required = [
      ['config', config],
      ['flowMeterId', config?.flowMeterId],
      ['pressureRanges', config?.pressureRanges],
    ];

    for (const [field, value] of required) {
      if (!value) {
        const error = new Error(`${field === 'config' ? 'Configuration' : field} is required`);
        this.handleError('validateConfig', error, null, { config, field, value });
        throw error;
      }
    }

    if (!config.pressureRanges.increasing || !config.pressureRanges.decreasing) {
      throw new Error('Pressure ranges must include both increasing and decreasing arrays');
    }
  }

  async cleanup() {
    try {
      if (this.fluke) {
        // Set Fluke to zero pressure before cleanup
        await this.fluke.setZeroPressureToFluke();
      }

      this.reset();
      this.showLogOnScreen('Flow meter sweep service cleaned up');
    } catch (error) {
      this.handleError(error, 'cleanup');
    }
  }

  handleError(error, method) {
    Sentry.captureException(error, {
      tags: { component: 'flow-meter-sweep-service', method },
    });
    console.error(`FlowMeterSweepService.${method}:`, error);
    this.showLogOnScreen(`Error in ${method}: ${error.message}`);
  }
}
