/**
 * Monster Meter Calibration Service - Refactored
 * Handles the calibration process for Monster Meter devices
 */
import { PolynomialRegression } from 'ml-regression-polynomial';
import { FlukeFactoryService } from './fluke-factory.service.js';
import { generateStepArray } from '../utils/kraken-calibration.utils.js';
import { MONSTER_METER_CONSTANTS } from '../../config/constants/monster-meter.constants.js';
import * as Sentry from '@sentry/electron/main';

class MonsterMeterCalibrationService {
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
      this.fluke = this.flukeFactory.getFlukeService(this.showLogOnScreen, () => this.isCalibrationActive && !this.isCalibrationStopped);

      // Load old coefficients from state (already stored on connection)
      this.loadOldCoefficientsFromState();
    } catch (error) {
      this.handleError(error, 'initialize');
      throw error;
    }
  }

  async startCalibration(testerName, model, serialNumber) {
    try {
      this.logDebugInfo('startCalibration', { testerName, model, serialNumber });

      this.initializeCalibrationState(testerName, model, serialNumber);
      this.validateConnection();

      // Old coefficients are already stored on connection
      this.generateSweepIntervals();

      this.sendToRenderer('monster-meter-calibration-started');
      await this.runCalibrationProcess();

      if (this.isCalibrationStopped) {
        return { success: false, error: 'Calibration was stopped by user' };
      }

      await this.completeCalibration();
      return { success: true };
    } catch (error) {
      return this.handleCalibrationError(error);
    }
  }

  async stopCalibration(reason = 'Calibration stopped by user') {
    try {
      this.showLogOnScreen(`🛑 Stopping calibration: ${reason}`);
      this.updateCalibrationFlags(false, true);

      // Set Fluke to zero but only disconnect if user is leaving (not for errors)
      if (this.fluke && this.fluke.telnetClient && this.fluke.telnetClient.isConnected) {
        await this.setFlukeToZero();

        // Only disconnect if user is leaving or service is being destroyed
        if (reason.includes('destroyed') || reason.includes('cleanup') || reason.includes('navigation')) {
          await this.fluke.telnetClient.disconnect();
          this.showLogOnScreen('🔌 Disconnected from Fluke');
        }
      }

      await this.handleCoefficientsRestore(reason);

      this.sendToRenderer('monster-meter-calibration-stopped', { reason });
      return { success: true };
    } catch (error) {
      this.handleError(error, 'stopCalibration');
      return { success: false, error: error.message };
    }
  }

  async runCalibrationProcess() {
    const steps = [
      { fn: this.connectToFluke, name: 'Connect to Fluke' },
      { fn: this.runFlukePreReqs, name: 'Fluke prerequisites' },
      { fn: this.checkZeroPressure, name: 'Zero pressure check' },
      { fn: this.waitForFluke, name: 'Wait for Fluke' },
      { fn: this.zeroMonsterMeter, name: 'Zero Monster Meter' },
      { fn: this.sendStartCalibrationCommandToMM, name: 'Start calibration' },
      { fn: this.runCalibrationSweep, name: 'Calibration sweep' },
    ];

    try {
      for (const step of steps) {
        if (this.isCalibrationStopped) return;
        await step.fn.call(this);
      }

      this.showLogOnScreen('✅ Calibration sweep completed');
    } catch (error) {
      this.showLogOnScreen(`❌ Calibration process failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  async runCalibrationSweep() {
    for (let index = 0; index < this.sweepIntervals.length; index++) {
      if (this.isCalibrationStopped) return;

      const pressureValue = this.sweepIntervals[index];
      await this.processPressurePoint(pressureValue);
    }
  }

  async processPressurePoint(pressureValue) {
    await this.fluke.setHighPressureToFluke(pressureValue);
    if (this.isCalibrationStopped) return;

    await this.fluke.waitForFlukeToReachTargetPressure(pressureValue);
    if (this.isCalibrationStopped) return;

    this.showLogOnScreen(`✅ Pressure reached ${pressureValue} PSI. Stabilizing...`);
    await this.addDelay(MONSTER_METER_CONSTANTS.DELAY_AFTER_COMMAND);
    if (this.isCalibrationStopped) return;

    this.showLogOnScreen('📸 Capturing Monster Meter readings...');
    const data = await this.monsterMeterCommunication.readData();

    if (this.isCalibrationStopped) return;

    if (!data) {
      this.showLogOnScreen('❌ Monster Meter not responding - stopping calibration');
      this.setFlukeToZero();
      throw new Error('Monster Meter is not responding');
    }

    this.sendLiveSensorData(data, pressureValue);
    this.processCalibrationData(data, pressureValue);
  }

  // Utility methods for common operations
  initializeCalibrationState(testerName, model, serialNumber) {
    Object.assign(this, { testerName, model, serialNumber });
    this.maxPressure = MONSTER_METER_CONSTANTS.SWEEP_VALUE;
    this.updateCalibrationFlags(true, false);
    this.clearSweepData();

    this.logCalibrationInfo();
  }

  updateCalibrationFlags(active, stopped) {
    this.isCalibrationActive = active;
    this.isCalibrationStopped = stopped;
  }

  validateConnection() {
    if (!this.monsterMeterState.isConnected) {
      throw new Error('Monster Meter is not connected');
    }
  }

  logCalibrationInfo() {
    const info = [`📊 Max pressure: ${this.maxPressure} PSI`, `🔧 Model: ${this.model}`, `🔢 Serial number: ${this.serialNumber}`];
    info.forEach(msg => this.showLogOnScreen(msg));
  }

  logDebugInfo(method, params) {
    console.log(`🔍 Debug - ${method} received parameters:`, params);
  }

  handleCalibrationError(error) {
    this.isCalibrationActive = false;
    this.handleError(error, 'startCalibration');
    this.sendToRenderer('monster-meter-calibration-failed', { error: error.message });
    return { success: false, error: error.message };
  }

  async setFlukeToZero() {
    if (this.fluke) {
      await this.fluke.setZeroPressureToFluke();
      this.showLogOnScreen('🔧 Fluke set to zero pressure');
    }
  }

  async handleCoefficientsRestore(reason) {
    const isStoppedByUser = ['Calibration stopped by user', 'Stopped by user'].includes(reason);
    const canRestore = isStoppedByUser && this.monsterMeterState.isConnected && this.oldCoefficients;

    // this.logRestoreDebugInfo(isStoppedByUser, canRestore);

    if (canRestore) {
      // this.showLogOnScreen('✅ All conditions met - writing old coefficients back');
      await this.writeOldCoefficientsBack();
    }
  }

  // Simplified step methods
  async connectToFluke() {
    try {
      const result = await this.fluke.connect();
      if (result.success) {
        this.showLogOnScreen('✅ Connected to Fluke successfully');
      } else {
        throw new Error(result.error || 'Failed to connect to Fluke');
      }
    } catch (error) {
      this.showLogOnScreen(`❌ Failed to connect to Fluke: ${error.message}`);
      throw error;
    }
  }

  async runFlukePreReqs() {
    await this.executeWithLogging('Fluke prerequisites', () => this.fluke.runPreReqs());
  }

  async checkZeroPressure() {
    this.showLogOnScreen('🔍 Checking zero pressure...');
    try {
      await this.fluke.setZeroPressureToFluke();
      await this.fluke.waitForFlukeToReachZeroPressure();
      this.showLogOnScreen('✅ Zero pressure confirmed');
    } catch (error) {
      this.showLogOnScreen(`❌ Zero pressure check failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  async waitForFluke() {
    try {
      await this.executeWithLogging('Waiting for Fluke', () => this.fluke.waitForFlukeToReachZeroPressure());
    } catch (error) {
      this.showLogOnScreen(`❌ Wait for Fluke failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  async zeroMonsterMeter() {
    const commands = [MONSTER_METER_CONSTANTS.COMMANDS.ZERO_HIGH, MONSTER_METER_CONSTANTS.COMMANDS.ZERO_LOW];

    for (const command of commands) {
      await this.monsterMeterCommunication.sendCommand(command);
      await this.addDelay(MONSTER_METER_CONSTANTS.DELAY_AFTER_COMMAND);
    }
    this.showLogOnScreen('✅ Monster Meter zeroed');
  }

  async sendStartCalibrationCommandToMM() {
    await this.monsterMeterCommunication.sendCommand(MONSTER_METER_CONSTANTS.COMMANDS.START_CAL);
    await this.addDelay(MONSTER_METER_CONSTANTS.DELAY_AFTER_COMMAND);
    this.showLogOnScreen('✅ Calibration command sent');
  }

  async executeWithLogging(action, fn) {
    this.showLogOnScreen(`🔧 ${action}...`);
    try {
      await fn();
      this.showLogOnScreen(`✅ ${action} completed`);
    } catch (error) {
      this.showLogOnScreen(`❌ ${action} failed: ${error.message || error.error || 'Unknown error'}`);
      throw error;
    }
  }

  sendLiveSensorData(data, referencePressure) {
    try {
      this.sendToRenderer('monster-meter-live-data', {
        referencePressure,
        voltageHi: data['SensorHi.vAVG'],
        pressureHi: data['SensorHi.psiAVG'],
        voltageLo: data['SensorLo.vAVG'],
        pressureLo: data['SensorLo.psiAVG'],
      });
    } catch (error) {
      this.handleError(error, 'sendLiveSensorData');
    }
  }

  clearSweepData() {
    const arrays = ['voltagesHiArray', 'pressureHiArray', 'voltagesLoArray', 'pressureLoArray'];
    arrays.forEach(arr => (this[arr] = []));
  }

  loadOldCoefficientsFromState() {
    try {
      // Load coefficients from Monster Meter state (already stored on connection)

      this.oldCoefficients = this.monsterMeterState.getOldCoefficients();

      if (this.oldCoefficients) {
        // this.showLogOnScreen('✅ Old coefficients loaded from state');
        console.log('[Calibration] Loaded old coefficients:', this.oldCoefficients);
      } else {
        // this.showLogOnScreen('⚠️ No old coefficients found in state');
        console.log('[Calibration] No old coefficients available');
      }
    } catch (error) {
      this.handleError(error, 'loadOldCoefficientsFromState');
      // this.showLogOnScreen(`❌ Error loading old coefficients from state: ${error.message}`);
      this.oldCoefficients = null;
    }
  }

  extractCoefficients(data) {
    return {
      hi: {
        coeffA: data['SensorHi.coeA'],
        coeffB: data['SensorHi.coeB'],
        coeffC: data['SensorHi.coeC'],
      },
      lo: {
        coeffA: data['SensorLo.coeA'],
        coeffB: data['SensorLo.coeB'],
        coeffC: data['SensorLo.coeC'],
      },
    };
  }

  async writeOldCoefficientsBack() {
    try {
      // this.showLogOnScreen('📝 Writing old coefficients back to Monster Meter...');
      if (!this.oldCoefficients) {
        // this.showLogOnScreen('⚠️ No old coefficients available to write back');
        return;
      }

      const buffer = this.buildCoefficientsBuffer(this.oldCoefficients);
      await this.monsterMeterCommunication.writeBuffer(buffer);
    } catch (error) {
      this.showLogOnScreen(`❌ Error writing old coefficients back: ${error.message}`);
    }
  }

  buildCoefficientsBuffer(coefficients) {
    const buffer = Buffer.alloc(36);
    buffer.writeUInt8(MONSTER_METER_CONSTANTS.COMMANDS.STOP_CAL, 0);

    const offsets = { hi: [7, 11, 15], lo: [19, 23, 27] };
    const coeffKeys = ['coeffA', 'coeffB', 'coeffC'];

    ['hi', 'lo'].forEach(sensor => {
      coeffKeys.forEach((key, i) => {
        buffer.writeFloatLE(coefficients[sensor][key], offsets[sensor][i]);
      });
    });

    return buffer;
  }

  processCalibrationData(data, pressureValue) {
    try {
      const sensorData = this.extractSensorData(data, pressureValue);
      this.updateArrays(sensorData);
      this.sendCalibrationUpdate();
    } catch (error) {
      this.handleError(error, 'processCalibrationData');
      throw error;
    }
  }

  extractSensorData(data, pressureValue) {
    const min = pressureValue - this.toleranceRange;
    const max = pressureValue + this.toleranceRange;

    const sensorData = {
      voltageLo: data['SensorLo.vAVG'],
      pressureLo: data['SensorLo.psiAVG'],
      voltageHi: data['SensorHi.vAVG'],
      pressureHi: data['SensorHi.psiAVG'],
      referencePressure: pressureValue,
    };

    // Validate sensor data for NaN/undefined values
    const requiredKeys = ['voltageLo', 'pressureLo', 'voltageHi', 'pressureHi'];
    for (const key of requiredKeys) {
      if (sensorData[key] === undefined || isNaN(sensorData[key])) {
        this.showLogOnScreen(`❌ Invalid ${key}: ${sensorData[key]} - Monster Meter may not be responding correctly`);
        throw new Error(`Invalid sensor data: ${key} is ${sensorData[key]}`);
      }
    }

    return sensorData;
  }

  updateArrays(sensorData) {
    this.voltagesLoArray.push(sensorData.voltageLo);
    this.pressureLoArray.push(sensorData.pressureLo);
    this.voltagesHiArray.push(sensorData.voltageHi);
    this.pressureHiArray.push(sensorData.pressureHi);
  }

  sendCalibrationUpdate() {
    const calibrationData = {
      pressureArr: this.sweepIntervals,
      voltagesHiArray: this.voltagesHiArray,
      pressureHiArray: this.pressureHiArray,
      voltagesLoArray: this.voltagesLoArray,
      pressureLoArray: this.pressureLoArray,
      activeTab: 'calibration',
      coefficients: null,
    };

    console.log('🔍 Debug - Sending calibration data:', {
      dataLength: this.pressureHiArray.length,
      hiValues: this.pressureHiArray,
      loValues: this.pressureLoArray,
    });

    this.sendToRenderer('monster-meter-calibration-data', calibrationData);
  }

  async completeCalibration() {
    this.showLogOnScreen('🎯 Completing calibration...');
    this.generateCoefficients();
    await this.writeCoefficientsToMonsterMeter();

    // Keep Fluke connected for potential verification process
    // Do not set Fluke to zero here - verification will start with zero setting as first step

    this.sendFinalResults();
  }

  generateCoefficients() {
    this.showLogOnScreen('🧮 Generating coefficients...');

    if (this.voltagesHiArray.length < 4 || this.voltagesLoArray.length < 4) {
      throw new Error('Insufficient data points for coefficient generation');
    }

    // Log input data for debugging
    console.log('🔍 Debug - Coefficient generation input:');
    console.log('Hi voltages:', this.voltagesHiArray);
    console.log('Lo voltages:', this.voltagesLoArray);
    console.log('Sweep intervals:', this.sweepIntervals);

    // Validate input arrays
    const validateArray = (arr, name) => {
      if (arr.some(val => isNaN(val) || val === undefined)) {
        throw new Error(`Invalid ${name} array contains NaN or undefined values: ${arr}`);
      }
    };

    validateArray(this.voltagesHiArray, 'voltagesHi');
    validateArray(this.voltagesLoArray, 'voltagesLo');
    validateArray(this.sweepIntervals, 'sweepIntervals');

    const regressions = {
      lo: new PolynomialRegression(this.voltagesLoArray, this.sweepIntervals, 3),
      hi: new PolynomialRegression(this.voltagesHiArray, this.sweepIntervals, 3),
    };

    this.currentCoefficients = {
      hi: { coeffA: regressions.hi.coefficients[1], coeffB: regressions.hi.coefficients[2], coeffC: regressions.hi.coefficients[3] },
      lo: { coeffA: regressions.lo.coefficients[1], coeffB: regressions.lo.coefficients[2], coeffC: regressions.lo.coefficients[3] },
    };

    console.log('🔍 Debug - Generated coefficients:');
    console.log('Hi coefficients:', this.currentCoefficients.hi);
    console.log('Lo coefficients:', this.currentCoefficients.lo);

    // Check for NaN coefficients and use fallback values if needed
    const fallbackCoefficients = MONSTER_METER_CONSTANTS.FALLBACK_COEFFICIENTS;

    // Check hi coefficients
    if (isNaN(this.currentCoefficients.hi.coeffA) || isNaN(this.currentCoefficients.hi.coeffB) || isNaN(this.currentCoefficients.hi.coeffC)) {
      this.currentCoefficients.hi = fallbackCoefficients.hi;
    }

    // Check lo coefficients
    if (isNaN(this.currentCoefficients.lo.coeffA) || isNaN(this.currentCoefficients.lo.coeffB) || isNaN(this.currentCoefficients.lo.coeffC)) {
      this.showLogOnScreen('⚠️ Generated Lo coefficients contain NaN - using fallback values');
      this.currentCoefficients.lo = fallbackCoefficients.lo;
    }
  }

  async writeCoefficientsToMonsterMeter() {
    this.showLogOnScreen('💾 Writing coefficients to Monster Meter...');

    if (!this.currentCoefficients?.hi || !this.currentCoefficients?.lo) {
      throw new Error('Coefficients not generated');
    }

    const buffer = this.buildCoefficientBuffer();
    // Write buffer directly (like old app) - no separate command needed
    await this.monsterMeterCommunication.writeBuffer(buffer);
    this.showLogOnScreen('✅ Coefficients written successfully!');
  }

  buildCoefficientBuffer() {
    const buffer = Buffer.alloc(36);
    const { hi, lo } = this.currentCoefficients;

    // Write STOP_CAL command at the beginning (like old app)
    buffer.writeUInt8(MONSTER_METER_CONSTANTS.COMMANDS.STOP_CAL, 0);

    // Write SensorHi coefficients (offsets match old app)
    buffer.writeFloatLE(hi.coeffA, 7);
    buffer.writeFloatLE(hi.coeffB, 11);
    buffer.writeFloatLE(hi.coeffC, 15);

    // Write SensorLo coefficients (offsets match old app)
    buffer.writeFloatLE(lo.coeffA, 19);
    buffer.writeFloatLE(lo.coeffB, 23);
    buffer.writeFloatLE(lo.coeffC, 27);

    console.log('TX Buffer:', buffer.toString('hex'));

    return buffer;
  }

  sendFinalResults() {
    this.sendToRenderer('monster-meter-calibration-completed', {
      pressureArr: this.sweepIntervals,
      voltagesHiArray: this.voltagesHiArray,
      pressureHiArray: this.pressureHiArray,
      voltagesLoArray: this.voltagesLoArray,
      pressureLoArray: this.pressureLoArray,
      activeTab: 'calibration',
      coefficients: this.currentCoefficients,
    });
  }

  generateSweepIntervals() {
    this.sweepIntervals = generateStepArray(this.maxPressure);
  }

  // Utility and status methods
  addDelay = ms => new Promise(resolve => setTimeout(resolve, ms));
  isActive = () => this.isCalibrationActive && !this.isCalibrationStopped;

  getStatus() {
    return {
      isActive: this.isCalibrationActive,
      isStopped: this.isCalibrationStopped,
      testerName: this.testerName,
      maxPressure: this.maxPressure,
      dataPoints: this.voltagesHiArray.length,
      coefficients: this.currentCoefficients,
    };
  }

  reset() {
    Object.assign(this, {
      isCalibrationActive: false,
      isCalibrationStopped: false,
      testerName: '',
      maxPressure: 250,
      sweepIntervals: [],
      voltagesHiArray: [],
      pressureHiArray: [],
      voltagesLoArray: [],
      pressureLoArray: [],
      currentCoefficients: null,
      oldCoefficients: null,
      fluke: null,
    });
  }

  handleError(error, method) {
    Sentry.captureException(error, {
      tags: { component: 'monster-meter-calibration-service', method },
    });
    console.error(`MonsterMeterCalibrationService.${method}:`, error);
  }

  async cleanup() {
    try {
      this.showLogOnScreen('🧹 Cleaning up Monster Meter calibration service...');
      if (this.isCalibrationActive) await this.stopCalibration('Service cleanup');

      // Reset Fluke factory instance for clean state
      if (this.flukeFactory) {
        this.flukeFactory.resetInstance();
      }

      this.reset();
      this.showLogOnScreen('✅ Monster Meter calibration service cleanup completed');
    } catch (error) {
      this.handleError(error, 'cleanup');
    }
  }

  destroy = async () => {
    try {
      await this.cleanup();
    } catch (error) {
      this.handleError(error, 'destroy');
    }
  };
}

export { MonsterMeterCalibrationService };
