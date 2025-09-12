/**
 * GVI Calibration State Service
 * Manages the state of GVI calibration process
 */

class GVICalibrationStateService {
  constructor() {
    this.reset();
  }

  reset() {
    this.isCalibrating = false;
    this.currentStepIndex = 0;
    this.calibrationSteps = [];
    this.currentPressure = null;
    this.currentGPM = null;
    this.testResults = [];
    this.model = null;
    this.tester = null;
    this.serialNumber = null;
  }

  startCalibration(model, tester, serialNumber, steps) {
    this.isCalibrating = true;
    this.model = model;
    this.tester = tester;
    this.serialNumber = serialNumber;
    this.calibrationSteps = steps;
    this.currentStepIndex = 0;
    this.currentPressure = null;
    this.currentGPM = null;
    this.testResults = [];
  }

  getCurrentStep() {
    if (this.currentStepIndex >= this.calibrationSteps.length) {
      return null;
    }
    return this.calibrationSteps[this.currentStepIndex];
  }

  getCurrentPressure() {
    const step = this.getCurrentStep();
    console.log('Current step for pressure:', step);
    return step ? step.psiMin : null;
  }

  nextStep() {
    this.currentStepIndex++;
  }

  isComplete() {
    return this.currentStepIndex >= this.calibrationSteps.length;
  }

  addTestResult(stepIndex, gpm, passed) {
    this.testResults[stepIndex] = {
      gpm,
      passed,
      timestamp: new Date().toISOString(),
    };
  }

  getProgress() {
    return {
      current: this.currentStepIndex + 1,
      total: this.calibrationSteps.length,
      percentage: Math.round(((this.currentStepIndex + 1) / this.calibrationSteps.length) * 100),
    };
  }

  getSummary() {
    return {
      model: this.model,
      tester: this.tester,
      serialNumber: this.serialNumber,
      totalSteps: this.calibrationSteps.length,
      completedSteps: this.testResults.length,
      passedSteps: this.testResults.filter(r => r.passed).length,
      failedSteps: this.testResults.filter(r => !r.passed).length,
      results: this.testResults,
    };
  }
}

// Export singleton instance
export const gviCalibrationState = new GVICalibrationStateService();
