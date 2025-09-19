import { EventEmitter } from 'events';

/**
 * Flow Meter Sweep State Service
 * Manages the state for flow meter sweep operations
 */
class FlowMeterSweepStateService extends EventEmitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.isSweepActive = false;
    this.currentStepIndex = 0;
    this.totalSteps = 0;
    this.currentConfig = null;
    this.pressureRanges = { increasing: [], decreasing: [] };
    this.isIncreasingPhase = true;
  }

  startSweep(flowMeterId, pressureRanges) {
    this.isSweepActive = true;
    this.currentStepIndex = 0;
    this.pressureRanges = pressureRanges;
    this.totalSteps = pressureRanges.increasing.length + pressureRanges.decreasing.length;
    this.isIncreasingPhase = true;

    this.currentConfig = {
      flowMeterId,
      pressureRanges,
    };

    this.emit('sweepStarted', {
      config: this.currentConfig,
      currentStep: this.currentStepIndex,
      totalSteps: this.totalSteps,
    });
  }

  updateStepIndex(stepIndex) {
    this.currentStepIndex = stepIndex;

    // Check if we need to switch phases
    if (this.isIncreasingPhase && stepIndex >= this.pressureRanges.increasing.length) {
      this.isIncreasingPhase = false;
    }
  }

  updateSweepStatus(isActive) {
    this.isSweepActive = isActive;

    if (!isActive) {
      this.reset();
    }
  }

  setCurrentConfig(config) {
    this.currentConfig = config;
  }

  getCurrentConfig() {
    return this.currentConfig;
  }

  getState() {
    return {
      isSweepActive: this.isSweepActive,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.totalSteps,
      currentConfig: this.currentConfig,
      pressureRanges: this.pressureRanges,
      isIncreasingPhase: this.isIncreasingPhase,
    };
  }

  async cleanup() {
    this.reset();
    this.removeAllListeners();
  }
}

// Singleton instance
let flowMeterSweepStateInstance = null;

export function getFlowMeterSweepState() {
  if (!flowMeterSweepStateInstance) {
    flowMeterSweepStateInstance = new FlowMeterSweepStateService();
  }
  return flowMeterSweepStateInstance;
}
