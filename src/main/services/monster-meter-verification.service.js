/**
 * Monster Meter Verification Service
 * Handles the verification process for Monster Meter devices
 * 
 * This service manages the verification workflow which includes:
 * - Sending VERIFY_ME command to Monster Meter
 * - Running 8-point pressure sweep (0 to 250 PSI)
 * - Capturing voltage and pressure data for both sensors
 * - Checking tolerance range (±2 PSI) for each point
 * - Generating pass/fail summary
 */
import { FlukeFactoryService } from './fluke-factory.service.js';
import { generateStepArray } from '../utils/kraken-calibration.utils.js';
import { MONSTER_METER_CONSTANTS } from '../../config/constants/monster-meter.constants.js';
import * as Sentry from '@sentry/electron/main';

class MonsterMeterVerificationService {
  constructor(monsterMeterState, monsterMeterCommunication, sendToRenderer, showLogOnScreen) {
    this.monsterMeterState = monsterMeterState;
    this.monsterMeterCommunication = monsterMeterCommunication;
    this.sendToRenderer = sendToRenderer;
    this.showLogOnScreen = showLogOnScreen;

    this.flukeFactory = new FlukeFactoryService();
    this.toleranceRange = MONSTER_METER_CONSTANTS.TOLERANCE_RANGE;

    this.reset();
  }

  async initialize() {
    try {
      this.fluke = this.flukeFactory.getFlukeService(
        this.showLogOnScreen, 
        () => this.isVerificationActive && !this.isVerificationStopped
      );
    } catch (error) {
      this.handleError('initialize', error);
      throw error;
    }
  }

  /**
   * Starts the verification process
   * @param {string} testerName - Name of the tester
   * @param {string} model - Monster Meter model
   * @param {string} serialNumber - Serial number of the device
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startVerification(testerName, model, serialNumber) {
    try {
      this.logDebugInfo('startVerification', { testerName, model, serialNumber });

      // Validate inputs and connection
      this.validateParameters(testerName, model, serialNumber);
      this.validateConnection();

      this.initializeVerificationState(testerName, model, serialNumber);
      this.generateSweepIntervals();

      this.sendToRenderer('monster-meter-verification-started');
      await this.runVerificationProcess();

      if (this.isVerificationStopped) {
        return { success: false, error: 'Verification was stopped by user' };
      }

      await this.completeVerification();
      return { success: true };
    } catch (error) {
      return this.handleVerificationError(error);
    }
  }

  async stopVerification(reason = 'Verification stopped by user') {
    try {
      this.updateVerificationFlags(false, true);
      await this.setFlukeToZero();
      this.sendToRenderer('monster-meter-verification-stopped', { reason });
      return { success: true };
    } catch (error) {
      this.handleError('stopVerification', error);
      return { success: false, error: error.message };
    }
  }

  getVerificationStatus() {
    return {
      isActive: this.isVerificationActive,
      isStopped: this.isVerificationStopped,
      testerName: this.testerName,
      model: this.model,
      serialNumber: this.serialNumber,
      progress: this.getProgressInfo()
    };
  }

  // Private methods
  initializeVerificationState(testerName, model, serialNumber) {
    this.testerName = testerName;
    this.model = model;
    this.serialNumber = serialNumber;
    this.maxPressure = MONSTER_METER_CONSTANTS.SWEEP_VALUE;
    this.clearVerificationData();
  }

  /**
   * Validates that Monster Meter is connected
   * @throws {Error} If Monster Meter is not connected
   * @private
   */
  validateConnection() {
    if (!this.monsterMeterState.isConnected) {
      throw new Error('Monster Meter is not connected');
    }
  }

  /**
   * Validates verification parameters
   * @param {string} testerName - Tester name
   * @param {string} model - Model name
   * @param {string} serialNumber - Serial number
   * @throws {Error} If parameters are invalid
   * @private
   */
  validateParameters(testerName, model, serialNumber) {
    if (!testerName || !model || !serialNumber) {
      throw new Error('Missing required parameters: testerName, model, and serialNumber are required');
    }
  }

  generateSweepIntervals() {
    this.sweepIntervals = generateStepArray(0, this.maxPressure, 8);
    this.logDebugInfo('generateSweepIntervals', { 
      intervals: this.sweepIntervals,
      count: this.sweepIntervals.length 
    });
  }

  /**
   * Runs the complete verification process
   * @private
   */
  async runVerificationProcess() {
    try {
      // Step 1: Send VERIFY_ME command to Monster Meter
      await this.sendVerifyMeCommand();
      await this.delay(2000);

      // Step 2: Run the pressure sweep
      this.showLogOnScreen('Verification sweep starting...');
      await this.runVerificationSweep();
      this.showLogOnScreen('Verification sweep completed');

      // Step 3: Set Fluke back to zero
      await this.delay(2000);
      await this.setFlukeToZero();
    } catch (error) {
      this.handleError('runVerificationProcess', error);
      throw error;
    }
  }

  async sendVerifyMeCommand() {
    try {
      await this.monsterMeterCommunication.sendCommand(MONSTER_METER_CONSTANTS.COMMANDS.VERIFY_ME);
      this.showLogOnScreen('Verify Me command sent to Monster Meter');
    } catch (error) {
      this.handleError('sendVerifyMeCommand', error);
      throw error;
    }
  }

  async runVerificationSweep() {
    for (let i = 0; i < this.sweepIntervals.length; i++) {
      if (this.isVerificationStopped) break;

      const pressureValue = this.sweepIntervals[i];
      await this.setFlukePressure(pressureValue);
      await this.waitForFlukePressure(pressureValue);
      await this.captureMonsterMeterData(pressureValue);
      await this.delay(1000);
    }
  }

  async setFlukePressure(pressure) {
    try {
      if (pressure === 0) {
        await this.fluke.setZeroPressureToFluke();
      } else {
        await this.fluke.setHighPressureToFluke(pressure);
      }
    } catch (error) {
      this.handleError('setFlukePressure', error, { pressure });
      throw error;
    }
  }

  async waitForFlukePressure(pressure) {
    try {
      if (pressure === 0) {
        await this.fluke.waitForFlukeToReachZeroPressure();
      } else {
        await this.fluke.waitForFlukeToReachTargetPressure(pressure);
      }
    } catch (error) {
      this.handleError('waitForFlukePressure', error, { pressure });
      throw error;
    }
  }

  async captureMonsterMeterData(pressureValue) {
    try {
      const data = await this.monsterMeterCommunication.readData();
      if (!data) {
        throw new Error('No data received from Monster Meter');
      }

      this.processVerificationData(data, pressureValue);
    } catch (error) {
      this.handleError('captureMonsterMeterData', error, { pressureValue });
      throw error;
    }
  }

  /**
   * Processes verification data from Monster Meter
   * @param {Object} data - Raw data from Monster Meter
   * @param {number} pressureValue - Target pressure value
   * @private
   */
  processVerificationData(data, pressureValue) {
    const voltageHi = data['SensorHi.vAVG'];
    const pressureHi = data['SensorHi.psiAVG'];
    const voltageLo = data['SensorLo.vAVG'];
    const pressureLo = data['SensorLo.psiAVG'];

    // Check if readings are within tolerance range
    const toleranceMin = pressureValue - this.toleranceRange;
    const toleranceMax = pressureValue + this.toleranceRange;
    const inRange = pressureHi >= toleranceMin && pressureHi <= toleranceMax && 
                   pressureLo >= toleranceMin && pressureLo <= toleranceMax;

    const verificationPoint = {
      referencePressure: pressureValue,
      voltageHi,
      pressureHi,
      voltageLo,
      pressureLo,
      inRange
    };

    this.updateVerificationArrays(voltageHi, pressureHi, voltageLo, pressureLo, pressureValue);
    this.dbDataVerification.push(verificationPoint);

    this.sendVerificationUpdate();
    this.sendLiveSensorData(data);
  }

  updateVerificationArrays(voltageHi, pressureHi, voltageLo, pressureLo, pressureValue) {
    this.voltagesHiArray.push(voltageHi);
    this.pressureHiArray.push(pressureHi);
    this.voltagesLoArray.push(voltageLo);
    this.pressureLoArray.push(pressureLo);
    this.sweepIntervalsCompleted.push(pressureValue);
  }

  sendVerificationUpdate() {
    this.sendToRenderer('monster-meter-verification-data', {
      pressureArr: this.sweepIntervals,
      voltagesHiArray: this.voltagesHiArray,
      pressureHiArray: this.pressureHiArray,
      voltagesLoArray: this.voltagesLoArray,
      pressureLoArray: this.pressureLoArray,
      completed: this.sweepIntervalsCompleted.length,
      total: this.sweepIntervals.length
    });
  }

  sendLiveSensorData(data) {
    this.sendToRenderer('monster-meter-live-data', {
      referencePressure: this.sweepIntervalsCompleted[this.sweepIntervalsCompleted.length - 1],
      sensorHi: {
        voltage: data['SensorHi.vAVG'],
        pressure: data['SensorHi.psiAVG']
      },
      sensorLo: {
        voltage: data['SensorLo.vAVG'],
        pressure: data['SensorLo.psiAVG']
      }
    });
  }

  async completeVerification() {
    try {
      this.updateVerificationFlags(false, false);
      this.sendFinalResults();
      this.showLogOnScreen('Verification completed successfully');
    } catch (error) {
      this.handleError('completeVerification', error);
      throw error;
    }
  }

  sendFinalResults() {
    this.sendToRenderer('monster-meter-verification-completed', {
      testerName: this.testerName,
      model: this.model,
      serialNumber: this.serialNumber,
      verificationData: this.dbDataVerification,
      summary: this.generateVerificationSummary()
    });
  }

  /**
   * Generates verification summary with pass/fail statistics
   * @returns {Object} Summary object with verification results
   * @private
   */
  generateVerificationSummary() {
    const totalPoints = this.dbDataVerification.length;
    const passedPoints = this.dbDataVerification.filter(point => point.inRange).length;
    const failedPoints = totalPoints - passedPoints;
    const passRate = totalPoints > 0 ? (passedPoints / totalPoints * 100).toFixed(1) : 0;
    const status = passedPoints === totalPoints ? 'PASSED' : 'FAILED';

    return {
      totalPoints,
      passedPoints,
      failedPoints,
      passRate: `${passRate}%`,
      status,
      toleranceRange: this.toleranceRange
    };
  }

  async setFlukeToZero() {
    try {
      await this.fluke.setZeroPressureToFluke();
      await this.fluke.waitForFlukeToReachZeroPressure();
    } catch (error) {
      this.handleError('setFlukeToZero', error);
    }
  }

  updateVerificationFlags(isActive, isStopped) {
    this.isVerificationActive = isActive;
    this.isVerificationStopped = isStopped;
  }

  clearVerificationData() {
    this.voltagesHiArray = [];
    this.pressureHiArray = [];
    this.voltagesLoArray = [];
    this.pressureLoArray = [];
    this.sweepIntervalsCompleted = [];
    this.dbDataVerification = [];
  }

  getProgressInfo() {
    return {
      completed: this.sweepIntervalsCompleted.length,
      total: this.sweepIntervals?.length || 0,
      percentage: this.sweepIntervals?.length > 0 
        ? Math.round((this.sweepIntervalsCompleted.length / this.sweepIntervals.length) * 100)
        : 0
    };
  }

  reset() {
    this.isVerificationActive = false;
    this.isVerificationStopped = false;
    this.testerName = null;
    this.model = null;
    this.serialNumber = null;
    this.maxPressure = 0;
    this.sweepIntervals = [];
    this.clearVerificationData();
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  logDebugInfo(method, data) {
    console.log(`[MonsterMeterVerificationService.${method}]`, data);
  }

  handleError(method, error, extra = {}) {
    Sentry.captureException(error, {
      tags: { service: 'monster-meter-verification', method },
      extra
    });
    console.error(`[MonsterMeterVerificationService.${method}]`, error);
  }

  handleVerificationError(error) {
    this.updateVerificationFlags(false, false);
    this.handleError('startVerification', error);
    return { success: false, error: error.message };
  }

  async destroy() {
    try {
      if (this.isVerificationActive) {
        await this.stopVerification('Service destroyed');
      }
      this.reset();
    } catch (error) {
      this.handleError('destroy', error);
    }
  }
}

export { MonsterMeterVerificationService };
