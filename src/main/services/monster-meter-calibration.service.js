/**
 * Monster Meter Calibration Service
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

    // Calibration state
    this.isCalibrationActive = false;
    this.isCalibrationStopped = false;
    this.testerName = '';
    this.maxPressure = 250;

    // Calibration data
    this.sweepIntervals = [];
    this.voltagesHiArray = [];
    this.pressureHiArray = [];
    this.voltagesLoArray = [];
    this.pressureLoArray = [];
    this.currentCoefficients = null;
    this.dbDataCalibration = [];

    // Fluke integration
    this.flukeFactory = new FlukeFactoryService();
    this.fluke = null;

    // Tolerance settings
    this.toleranceRange = 2; // 2% tolerance
  }

  /**
   * Initialize the calibration service
   */
  async initialize() {
    try {
      // this.showLogOnScreen('🔧 Initializing Monster Meter calibration service...');

      // Get Fluke service instance
      this.fluke = this.flukeFactory.getFlukeService(this.showLogOnScreen, () => this.isCalibrationActive && !this.isCalibrationStopped);

      // this.showLogOnScreen('✅ Monster Meter calibration service initialized');
    } catch (error) {
      this.handleError(error, 'initialize');
      throw error;
    }
  }

  /**
   * Start calibration process
   * @param {string} testerName - Name of the tester
   * @param {string} model - Model of the Monster Meter
   * @param {string} serialNumber - Serial number of the device
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startCalibration(testerName, model, serialNumber) {
    try {
      console.log('🔍 Debug - Calibration service startCalibration received parameters:');
      console.log('🔍 Debug - testerName:', testerName);
      console.log('🔍 Debug - model:', model);
      console.log('🔍 Debug - serialNumber:', serialNumber);

      this.testerName = testerName;
      this.model = model;
      this.serialNumber = serialNumber;
      // Use SWEEP_VALUE from constants as max pressure
      this.maxPressure = MONSTER_METER_CONSTANTS.SWEEP_VALUE;
      this.isCalibrationActive = true;
      this.isCalibrationStopped = false;

      // Clear previous calibration data when starting new calibration
      this.clearSweepData();

      // this.showLogOnScreen(`🚀 Starting Monster Meter calibration for ${testerName}`);
      this.showLogOnScreen(`📊 Max pressure: ${this.maxPressure} PSI`);
      this.showLogOnScreen(`🔧 Model: ${model}`);
      this.showLogOnScreen(`🔢 Serial number: ${serialNumber}`);

      // Validate Monster Meter connection
      if (!this.monsterMeterState.isConnected) {
        throw new Error('Monster Meter is not connected');
      }

      // Store old coefficients before starting calibration
      await this.storeOldCoefficients();

      // Generate sweep intervals
      this.generateSweepIntervals();

      // Send calibration started event
      this.sendToRenderer('monster-meter-calibration-started');

      // Run calibration process
      await this.runCalibrationProcess();

      if (this.isCalibrationStopped) {
        return { success: false, error: 'Calibration was stopped by user' };
      }

      // Complete calibration
      await this.completeCalibration();

      return { success: true };
    } catch (error) {
      this.isCalibrationActive = false;
      this.handleError(error, 'startCalibration');
      this.sendToRenderer('monster-meter-calibration-failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop calibration process
   * @param {string} reason - Reason for stopping
   * @returns {Promise<{success: boolean}>}
   */
  async stopCalibration(reason = 'Calibration stopped by user') {
    try {
      this.showLogOnScreen(`🛑 Stopping calibration: ${reason}`);

      this.isCalibrationStopped = true;
      this.isCalibrationActive = false;

      // Keep sweep data visible - don't clear when stopping

      // Set Fluke to zero pressure
      if (this.fluke) {
        await this.fluke.setZeroPressureToFluke();
        this.showLogOnScreen('🔧 Fluke set to zero pressure');
      }

      // Write old coefficients back if Monster Meter is still connected and stopped by user
      const isStoppedByUser = reason === 'Calibration stopped by user' || reason === 'Stopped by user';

      this.showLogOnScreen(`🔍 Debug - isStoppedByUser: ${isStoppedByUser}`);
      this.showLogOnScreen(`🔍 Debug - isConnected: ${this.monsterMeterState.isConnected}`);
      this.showLogOnScreen(`🔍 Debug - hasOldCoefficients: ${!!this.oldCoefficients}`);

      if (isStoppedByUser && this.monsterMeterState.isConnected && this.oldCoefficients) {
        this.showLogOnScreen('✅ All conditions met - writing old coefficients back');
        await this.writeOldCoefficientsBack();
      } else if (isStoppedByUser && !this.monsterMeterState.isConnected) {
        this.showLogOnScreen('⚠️ Cannot write old coefficients back - Monster Meter disconnected');
      } else if (isStoppedByUser && !this.oldCoefficients) {
        this.showLogOnScreen('⚠️ Cannot write old coefficients back - no old coefficients available');
      } else if (!isStoppedByUser) {
        this.showLogOnScreen('ℹ️ Calibration stopped due to disconnection - not writing old coefficients back');
      }

      // Send calibration stopped event
      this.sendToRenderer('monster-meter-calibration-stopped', { reason });

      return { success: true };
    } catch (error) {
      this.handleError(error, 'stopCalibration');
      return { success: false, error: error.message };
    }
  }

  /**
   * Run the complete calibration process
   */
  async runCalibrationProcess() {
    try {
      // Step 1: Run Fluke prerequisites
      await this.runFlukePreReqs();
      if (this.isCalibrationStopped) return;

      // Step 2: Check zero pressure
      await this.checkZeroPressure();
      if (this.isCalibrationStopped) return;

      // Step 3: Wait for Fluke to be ready
      await this.waitForFluke();
      if (this.isCalibrationStopped) return;

      // Step 4: Zero Monster Meter
      await this.zeroMonsterMeter();
      if (this.isCalibrationStopped) return;

      // Step 5: Start calibration command
      await this.sendStartCalibrationCommandToMM();
      if (this.isCalibrationStopped) return;

      // Step 6: Run calibration sweep
      // this.showLogOnScreen('📈 Calibration sweep starting...');
      await this.runCalibrationSweep();
      if (this.isCalibrationStopped) return;

      this.showLogOnScreen('✅ Calibration sweep completed');

      // Step 7: Set Fluke to zero
      await this.fluke.setZeroPressureToFluke();
      await this.waitForFluke();
      if (this.isCalibrationStopped) return;
    } catch (error) {
      this.handleError(error, 'runCalibrationProcess');
      throw error;
    }
  }

  /**
   * Run Fluke prerequisites
   */
  async runFlukePreReqs() {
    try {
      this.showLogOnScreen('🔧 Running Fluke prerequisites...');
      await this.fluke.runPreReqs();
      this.showLogOnScreen('✅ Fluke prerequisites completed');
    } catch (error) {
      this.handleError(error, 'runFlukePreReqs');
      throw error;
    }
  }

  /**
   * Check zero pressure on Fluke
   */
  async checkZeroPressure() {
    try {
      this.showLogOnScreen('🔍 Checking zero pressure...');
      await this.fluke.setZeroPressureToFluke();
      await this.fluke.waitForFlukeToReachZeroPressure();
      this.showLogOnScreen('✅ Zero pressure confirmed');
    } catch (error) {
      this.handleError(error, 'checkZeroPressure');
      throw error;
    }
  }

  /**
   * Wait for Fluke to be ready
   */
  async waitForFluke() {
    try {
      this.showLogOnScreen('⏳ Waiting for Fluke to be ready...');
      await this.fluke.waitForFlukeToReachZeroPressure();
      this.showLogOnScreen('✅ Fluke is ready');
    } catch (error) {
      this.handleError(error, 'waitForFluke');
      throw error;
    }
  }

  /**
   * Zero the Monster Meter
   */
  async zeroMonsterMeter() {
    try {
      // this.showLogOnScreen('🔧 Zeroing Monster Meter...');
      await this.monsterMeterCommunication.sendCommand(MONSTER_METER_CONSTANTS.COMMANDS.ZERO_HIGH);
      await this.addDelay(MONSTER_METER_CONSTANTS.DELAY_AFTER_COMMAND);
      await this.monsterMeterCommunication.sendCommand(MONSTER_METER_CONSTANTS.COMMANDS.ZERO_LOW);
      await this.addDelay(MONSTER_METER_CONSTANTS.DELAY_AFTER_COMMAND);
      this.showLogOnScreen('✅ Monster Meter zeroed');
    } catch (error) {
      this.handleError(error, 'zeroMonsterMeter');
      throw error;
    }
  }

  /**
   * Send start calibration command to Monster Meter
   */
  async sendStartCalibrationCommandToMM() {
    try {
      // this.showLogOnScreen('🚀 Starting calibration command...');
      await this.monsterMeterCommunication.sendCommand(MONSTER_METER_CONSTANTS.COMMANDS.START_CAL);
      await this.addDelay(MONSTER_METER_CONSTANTS.DELAY_AFTER_COMMAND);
      this.showLogOnScreen('✅ Calibration command sent');
    } catch (error) {
      this.handleError(error, 'sendStartCalibrationCommandToMM');
      throw error;
    }
  }

  /**
   * Run calibration sweep through pressure points
   */
  async runCalibrationSweep() {
    try {
      for (let index = 0; index < this.sweepIntervals.length; index++) {
        if (this.isCalibrationStopped) return;

        const pressureValue = this.sweepIntervals[index];
        // this.showLogOnScreen(`📊 Setting pressure to ${pressureValue} PSI...`);

        // Set Fluke pressure
        await this.fluke.setHighPressureToFluke(pressureValue);
        if (this.isCalibrationStopped) return;

        // Wait for pressure to stabilize
        await this.fluke.waitForFlukeToReachTargetPressure(pressureValue);
        if (this.isCalibrationStopped) return;

        this.showLogOnScreen(`✅ Pressure reached ${pressureValue} PSI. Stabilizing...`);
        await this.addDelay(5000); // 5 second stabilization
        if (this.isCalibrationStopped) return;

        // Get data from Monster Meter
        this.showLogOnScreen('📸 Capturing Monster Meter readings...');
        const data = await this.monsterMeterCommunication.readData();
        if (this.isCalibrationStopped) return;

        if (data) {
          // Send live sensor data to update pressure readings
          this.sendLiveSensorData(data, pressureValue);

          this.processCalibrationData(data, pressureValue);
          // this.showLogOnScreen(`📊 Data captured: ${JSON.stringify(data)}`);
        } else {
          throw new Error('Failed to get data from Monster Meter');
        }
      }
    } catch (error) {
      this.handleError(error, 'runCalibrationSweep');
      throw error;
    }
  }

  /**
   * Send live sensor data to update pressure readings section
   */
  sendLiveSensorData(data, referencePressure) {
    try {
      const voltageHi = data['SensorHi.vAVG'];
      const voltageLo = data['SensorLo.vAVG'];
      const pressureHi = data['SensorHi.pAVG'];
      const pressureLo = data['SensorLo.pAVG'];

      this.sendToRenderer('monster-meter-live-data', {
        referencePressure: referencePressure,
        voltageHi: voltageHi,
        pressureHi: pressureHi,
        voltageLo: voltageLo,
        pressureLo: pressureLo,
      });
    } catch (error) {
      this.handleError(error, 'sendLiveSensorData');
    }
  }

  /**
   * Clear all sweep data arrays
   */
  clearSweepData() {
    this.voltagesHiArray = [];
    this.pressureHiArray = [];
    this.voltagesLoArray = [];
    this.pressureLoArray = [];
    this.dbDataCalibration = [];
    // this.showLogOnScreen('🧹 Sweep data cleared');
  }

  /**
   * Store old coefficients from Monster Meter before starting calibration
   */
  async storeOldCoefficients() {
    try {
      this.showLogOnScreen('📖 Reading current coefficients from Monster Meter...');
      const data = await this.monsterMeterCommunication.readData();

      if (data) {
        this.oldCoefficients = {
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

        this.showLogOnScreen('✅ Old coefficients stored successfully');
        this.showLogOnScreen(`📊 Old SensorHi coefficients: A=${this.oldCoefficients.hi.coeffA}, B=${this.oldCoefficients.hi.coeffB}, C=${this.oldCoefficients.hi.coeffC}`);
        this.showLogOnScreen(`📊 Old SensorLo coefficients: A=${this.oldCoefficients.lo.coeffA}, B=${this.oldCoefficients.lo.coeffB}, C=${this.oldCoefficients.lo.coeffC}`);
      } else {
        this.showLogOnScreen('⚠️ Could not read old coefficients from Monster Meter');
        this.oldCoefficients = null;
      }
    } catch (error) {
      this.showLogOnScreen(`❌ Error reading old coefficients: ${error.message}`);
      this.oldCoefficients = null;
    }
  }

  /**
   * Write old coefficients back to Monster Meter
   */
  async writeOldCoefficientsBack() {
    try {
      this.showLogOnScreen('📝 Writing old coefficients back to Monster Meter...');

      if (!this.oldCoefficients) {
        this.showLogOnScreen('⚠️ No old coefficients available to write back');
        return;
      }

      // Build the buffer with old coefficients (exactly like buildStopCalBuffer in old app)
      const buffer = this.buildCoefficientsBuffer(this.oldCoefficients);

      // Write the buffer directly to Monster Meter (no separate command needed)
      await this.monsterMeterCommunication.writeBuffer(buffer);

      // this.showLogOnScreen('✅ Old coefficients written back successfully');
      // this.showLogOnScreen(`📊 Restored SensorHi coefficients: A=${this.oldCoefficients.hi.coeffA}, B=${this.oldCoefficients.hi.coeffB}, C=${this.oldCoefficients.hi.coeffC}`);
      // this.showLogOnScreen(`📊 Restored SensorLo coefficients: A=${this.oldCoefficients.lo.coeffA}, B=${this.oldCoefficients.lo.coeffB}, C=${this.oldCoefficients.lo.coeffC}`);
    } catch (error) {
      this.showLogOnScreen(`❌ Error writing old coefficients back: ${error.message}`);
    }
  }

  /**
   * Build coefficients buffer for writing to Monster Meter
   * Exactly matches buildStopCalBuffer from old app
   */
  buildCoefficientsBuffer(coefficients) {
    const buffer = Buffer.alloc(36);

    // Write STOP_CAL command at the beginning (like old app)
    buffer.writeUInt8(MONSTER_METER_CONSTANTS.COMMANDS.STOP_CAL, 0);

    // Write SensorHi coefficients (offsets match old app)
    buffer.writeFloatLE(coefficients.hi.coeffA, 7);
    buffer.writeFloatLE(coefficients.hi.coeffB, 11);
    buffer.writeFloatLE(coefficients.hi.coeffC, 15);

    // Write SensorLo coefficients (offsets match old app)
    buffer.writeFloatLE(coefficients.lo.coeffA, 19);
    buffer.writeFloatLE(coefficients.lo.coeffB, 23);
    buffer.writeFloatLE(coefficients.lo.coeffC, 27);

    // this.showLogOnScreen(`📤 TX Buffer: ${buffer.toString('hex')}`);

    return buffer;
  }

  /**
   * Process calibration data and store for coefficient generation
   */
  processCalibrationData(data, pressureValue) {
    try {
      const voltageLo = data['SensorLo.vAVG'];
      const pressureLo = data['SensorLo.psiAVG'];
      const voltageHi = data['SensorHi.vAVG'];
      const pressureHi = data['SensorHi.psiAVG'];

      // Check if readings are within tolerance
      const min = pressureValue - (pressureValue * this.toleranceRange) / 100;
      const max = pressureValue + (pressureValue * this.toleranceRange) / 100;
      const inRange = pressureHi >= min && pressureHi <= max && pressureLo >= min && pressureLo <= max;

      // Store data
      this.voltagesLoArray.push(voltageLo);
      this.pressureLoArray.push(pressureLo);
      this.voltagesHiArray.push(voltageHi);
      this.pressureHiArray.push(pressureHi);

      const dbDataObj = {
        referencePressure: pressureValue,
        voltageHi,
        pressureHi,
        voltageLo,
        pressureLo,
        inRange,
      };

      this.dbDataCalibration.push(dbDataObj);

      // Send real-time data to renderer
      const calibrationData = {
        pressureArr: this.sweepIntervals, // Send full array for correct total count
        voltagesHiArray: this.voltagesHiArray,
        pressureHiArray: this.pressureHiArray,
        voltagesLoArray: this.voltagesLoArray,
        pressureLoArray: this.pressureLoArray,
        activeTab: 'calibration',
        coefficients: null,
      };

      console.log('🔍 Debug - Sending calibration data to renderer:', calibrationData);
      console.log('🔍 Debug - pressureHiArray length:', this.pressureHiArray.length);
      console.log('🔍 Debug - pressureLoArray length:', this.pressureLoArray.length);
      console.log('🔍 Debug - pressureHiArray values:', this.pressureHiArray);
      console.log('🔍 Debug - pressureLoArray values:', this.pressureLoArray);

      this.sendToRenderer('monster-meter-calibration-data', calibrationData);
    } catch (error) {
      this.handleError(error, 'processCalibrationData');
      throw error;
    }
  }

  /**
   * Complete calibration process
   */
  async completeCalibration() {
    try {
      this.showLogOnScreen('🎯 Completing calibration...');

      // Generate coefficients
      this.generateCoefficients();

      // Write coefficients to Monster Meter
      await this.writeCoefficientsToMonsterMeter();

      // Send final results
      this.sendToRenderer('monster-meter-calibration-completed', {
        pressureArr: this.sweepIntervals,
        voltagesHiArray: this.voltagesHiArray,
        pressureHiArray: this.pressureHiArray,
        voltagesLoArray: this.voltagesLoArray,
        pressureLoArray: this.pressureLoArray,
        activeTab: 'calibration',
        coefficients: this.currentCoefficients,
      });

      // this.showLogOnScreen('✅ Calibration completed successfully!');
    } catch (error) {
      this.handleError(error, 'completeCalibration');
      throw error;
    }
  }

  /**
   * Generate polynomial coefficients from calibration data
   */
  generateCoefficients() {
    try {
      this.showLogOnScreen('🧮 Generating coefficients...');

      if (this.voltagesHiArray.length < 4 || this.voltagesLoArray.length < 4) {
        throw new Error('Insufficient data points for coefficient generation');
      }

      // Generate degree 3 polynomial fit
      const regressionLo = new PolynomialRegression(this.voltagesLoArray, this.sweepIntervals, 3);
      const coeffsLo = regressionLo.coefficients;

      const regressionHi = new PolynomialRegression(this.voltagesHiArray, this.sweepIntervals, 3);
      const coeffsHi = regressionHi.coefficients;

      this.currentCoefficients = {
        hi: {
          coeffA: coeffsHi[1],
          coeffB: coeffsHi[2],
          coeffC: coeffsHi[3],
        },
        lo: {
          coeffA: coeffsLo[1],
          coeffB: coeffsLo[2],
          coeffC: coeffsLo[3],
        },
      };

      this.showLogOnScreen(`📊 Coefficients for Sensor Hi: ${JSON.stringify(this.currentCoefficients.hi)}`);
      this.showLogOnScreen(`📊 Coefficients for Sensor Lo: ${JSON.stringify(this.currentCoefficients.lo)}`);
    } catch (error) {
      this.handleError(error, 'generateCoefficients');
      throw error;
    }
  }

  /**
   * Write coefficients to Monster Meter
   */
  async writeCoefficientsToMonsterMeter() {
    try {
      this.showLogOnScreen('💾 Writing coefficients to Monster Meter...');

      if (!this.currentCoefficients || !this.currentCoefficients.hi || !this.currentCoefficients.lo) {
        throw new Error('Coefficients not generated');
      }

      // Build coefficient buffer
      const buffer = this.buildCoefficientBuffer();

      // Send stop calibration command with coefficients
      await this.monsterMeterCommunication.sendCommand(MONSTER_METER_CONSTANTS.COMMANDS.STOP_CAL, buffer);

      this.showLogOnScreen('✅ Coefficients written successfully!');
    } catch (error) {
      this.handleError(error, 'writeCoefficientsToMonsterMeter');
      throw error;
    }
  }

  /**
   * Build coefficient buffer for writing to Monster Meter
   */
  buildCoefficientBuffer() {
    try {
      const hi = this.currentCoefficients.hi;
      const lo = this.currentCoefficients.lo;

      // Create 36-byte buffer as per Monster Meter protocol
      const buffer = Buffer.alloc(MONSTER_METER_CONSTANTS.COMMAND_BUFFER_SIZE);

      // Fill buffer with coefficients (implementation depends on Monster Meter protocol)
      // This is a simplified version - actual implementation should match the old app
      buffer.writeFloatLE(hi.coeffA, 0);
      buffer.writeFloatLE(hi.coeffB, 4);
      buffer.writeFloatLE(hi.coeffC, 8);
      buffer.writeFloatLE(lo.coeffA, 12);
      buffer.writeFloatLE(lo.coeffB, 16);
      buffer.writeFloatLE(lo.coeffC, 20);

      return buffer;
    } catch (error) {
      this.handleError(error, 'buildCoefficientBuffer');
      throw error;
    }
  }

  /**
   * Generate sweep intervals for calibration
   */
  generateSweepIntervals() {
    try {
      // Use the same generateStepArray utility as Kraken calibration
      this.sweepIntervals = generateStepArray(this.maxPressure);

      this.showLogOnScreen(`📊 Generated ${this.sweepIntervals.length} pressure points: ${this.sweepIntervals.join(', ')}`);
    } catch (error) {
      this.handleError(error, 'generateSweepIntervals');
      throw error;
    }
  }

  /**
   * Add delay
   */
  async addDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if calibration is active
   */
  isActive() {
    return this.isCalibrationActive && !this.isCalibrationStopped;
  }

  /**
   * Get calibration status
   */
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

  /**
   * Reset calibration data
   */
  reset() {
    this.isCalibrationActive = false;
    this.isCalibrationStopped = false;
    this.testerName = '';
    this.maxPressure = 250;
    this.sweepIntervals = [];
    this.voltagesHiArray = [];
    this.pressureHiArray = [];
    this.voltagesLoArray = [];
    this.pressureLoArray = [];
    this.currentCoefficients = null;
    this.dbDataCalibration = [];
  }

  /**
   * Handle errors with Sentry integration
   */
  handleError(error, method) {
    Sentry.captureException(error, {
      tags: {
        component: 'monster-meter-calibration-service',
        method: method,
      },
    });
    console.error(`MonsterMeterCalibrationService.${method}:`, error);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      this.showLogOnScreen('🧹 Cleaning up Monster Meter calibration service...');

      if (this.isCalibrationActive) {
        await this.stopCalibration('Service cleanup');
      }

      this.reset();

      this.showLogOnScreen('✅ Monster Meter calibration service cleanup completed');
    } catch (error) {
      this.handleError(error, 'cleanup');
    }
  }

  /**
   * Destroy the service
   */
  async destroy() {
    try {
      await this.cleanup();
      this.fluke = null;
    } catch (error) {
      this.handleError(error, 'destroy');
    }
  }
}

export { MonsterMeterCalibrationService };
