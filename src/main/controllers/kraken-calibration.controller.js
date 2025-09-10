import { getKrakenConnection } from '../services/kraken-connection.service.js';
import { getKrakenScanner } from '../services/kraken-scanner.service.js';
import { getKrakenCalibrationState } from '../../state/kraken-calibration-state.service.js';
import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import { addDelay } from '../../shared/helpers/calibration-helper.js';
import { FlukeFactoryService } from '../services/fluke-factory.service.js';

// Import the new managers
import { KrakenDeviceSetupManager } from '../managers/kraken-device-setup.manager.js';
import { KrakenConnectivityManager } from '../managers/kraken-connectivity.manager.js';
import { KrakenCalibrationManager } from '../managers/kraken-calibration.manager.js';
import { KrakenUIManager } from '../managers/kraken-ui.manager.js';
import { KrakenVerificationService } from '../services/kraken-verification.service.js';

import * as Sentry from '@sentry/electron/main';

/**
 * Kraken Calibration Controller
 * Orchestrates calibration process using specialized managers
 */
class KrakenCalibrationController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.connection = getKrakenConnection();
    this.scanner = getKrakenScanner();
    this.globalState = getKrakenCalibrationState();

    this.initializeServices();
    this.setupEventListeners();
    this.initializeManagers();
  }

  initializeServices() {
    this.globalState.setMainWindow(this.mainWindow);
    this.globalState.setController(this);
    this.globalState.setServices(this.scanner, this.connection);
  }

  setupEventListeners() {
    // Connection events
    this.connection.on('deviceDisconnected', deviceId => {
      this.connectivityManager.handleDeviceDisconnection(deviceId);
    });

    // Global state events
    this.globalState.on('deviceStatusUpdate', ({ deviceId, status }) => {
      this.uiManager.sendToRenderer('device-status-update', { deviceId, status });
      this.uiManager.updateProgressSummary();
    });
  }

  initializeManagers() {
    // Initialize UI Manager first (needed by other managers)
    this.uiManager = new KrakenUIManager(this.mainWindow, this.globalState, this.sendToRenderer.bind(this));

    // Initialize Fluke Manager using factory with fresh settings from DB
    this.flukeFactory = new FlukeFactoryService();
    this.flukeManager = this.flukeFactory.getFlukeService(
      log => this.uiManager.showLogOnScreen(log),
      () => this.globalState.isCalibrationActive
    );

    this.deviceSetupManager = new KrakenDeviceSetupManager(this.globalState, this.connection, this.scanner, this.sendToRenderer.bind(this));

    this.connectivityManager = new KrakenConnectivityManager(this.globalState, this.connection, this.scanner, this.sendToRenderer.bind(this));

    this.calibrationManager = new KrakenCalibrationManager(this.globalState, this.flukeManager, this.sendToRenderer.bind(this), this.uiManager.showLogOnScreen.bind(this.uiManager));

    this.verificationService = new KrakenVerificationService(this.globalState, this.flukeManager, this.sendToRenderer.bind(this), this.uiManager.showLogOnScreen.bind(this.uiManager));
    // Set up cross-references for managers that need each other
    this.calibrationManager.sweepValue = KRAKEN_CONSTANTS.SWEEP_VALUE;
    this.calibrationManager.updateDeviceWidgetsForCalibration = this.uiManager.updateDeviceWidgetsForCalibration.bind(this.uiManager);
    this.connectivityManager.setupDevice = this.deviceSetupManager.setupDevice.bind(this.deviceSetupManager);
    this.connectivityManager.updateProgressSummary = this.uiManager.updateProgressSummary.bind(this.uiManager);
    this.connectivityManager.updateCalibrationButtonState = this.uiManager.updateCalibrationButtonState.bind(this.uiManager);
    this.connectivityManager.checkAllDevicesReady = this.deviceSetupManager.checkAllDevicesReady.bind(this.deviceSetupManager);
  }

  async initialize(connectedDeviceIds = []) {
    try {
      this.sendToRenderer('show-page-loader');

      const validDevices = await this.validateAndHydrateDevices(connectedDeviceIds);

      // Initialize UI with validated devices
      const formattedDevices = validDevices.map(device => this.uiManager.formatDeviceForRenderer(device));
      this.sendToRenderer('initialize-devices', formattedDevices);
      this.sendToRenderer('hide-page-loader');

      console.log(`Initializing calibration with ${validDevices.length} validated devices`);

      // Start sequential setup after delay (like old app)
      console.log(`Waiting ${KRAKEN_CONSTANTS.DELAY_BEFORE_SETUP}ms before starting device setup...`);
      await this.globalState.addDelay(KRAKEN_CONSTANTS.DELAY_BEFORE_SETUP);
      await this.deviceSetupManager.startSequentialSetup();

      // Start connectivity monitoring after setup
      this.connectivityManager.startConnectivityMonitoring();

      return { success: true, deviceCount: validDevices.length };
    } catch (error) {
      console.error('Error initializing kraken calibration:', error);
      this.sendToRenderer('hide-page-loader');
      return { success: false, error: error.message };
    }
  }

  async validateAndHydrateDevices(connectedDeviceIds) {
    // Hydrate global state from passed device IDs if state is empty
    let devices = this.globalState.getConnectedDevices();
    if (devices.length === 0 && Array.isArray(connectedDeviceIds) && connectedDeviceIds.length > 0) {
      devices = await this.hydrateDevicesFromIds(connectedDeviceIds);
    }

    if (devices.length === 0) {
      throw new Error('No connected devices found in global state');
    }

    // Validate that all devices from the list are still connected
    const validDevices = await this.validateDeviceConnections(devices);

    if (validDevices.length === 0) {
      throw new Error('No valid connected devices found for calibration');
    }

    if (validDevices.length !== devices.length) {
      console.warn(`${devices.length - validDevices.length} devices were dropped during validation`);
      // Update global state with only valid devices
      this.globalState.setConnectedDevices(validDevices);
    }

    return validDevices;
  }

  async hydrateDevicesFromIds(connectedDeviceIds) {
    const hydratedDevices = [];
    for (const deviceId of connectedDeviceIds) {
      const connectedDevice = this.connection.getConnectedDevice(deviceId);
      if (connectedDevice && connectedDevice.connectionState === KRAKEN_CONSTANTS.CONNECTION_STATES.CONNECTED) {
        hydratedDevices.push(connectedDevice);
      }
    }
    if (hydratedDevices.length > 0) {
      this.globalState.setConnectedDevices(hydratedDevices);
    }
    return this.globalState.getConnectedDevices();
  }

  async validateDeviceConnections(devices) {
    const validDevices = [];
    const connectionService = this.connection;

    for (const device of devices) {
      const isConnected = connectionService.isDeviceConnected(device.id);
      const connectedDevice = connectionService.getConnectedDevice(device.id);

      if (isConnected && connectedDevice && connectedDevice.connectionState === KRAKEN_CONSTANTS.CONNECTION_STATES.CONNECTED) {
        validDevices.push(device);
        console.log(`Device ${device.id} validated as connected`);
      } else {
        console.warn(`Device ${device.id} is not properly connected, excluding from calibration`);
      }
    }

    return validDevices;
  }

  /**
   * Start calibration process
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startCalibration(testerName) {
    this.testerName = testerName;
    try {
      await this.validateDevicesForCalibration();

      this.sendToRenderer('calibration-started');
      this.sendToRenderer('show-notification', {
        type: 'info',
        message: 'Calibration started successfully!',
      });

      await this.setupCalibrationUI();
      await this.prepareFlukeAndDevices();
      await this.executeCalibration();

      // Only complete calibration if it wasn't stopped
      if (this.globalState.isCalibrationActive) {
        await this.completeCalibration();
        // Return success response
        return { success: true };
      } else {
        // Calibration was stopped, return early without completing
        return { success: false, error: 'Calibration was stopped by user' };
      }
    } catch (error) {
      this.globalState.isCalibrationActive = false;
      console.error('Error starting calibration:', error);
      Sentry.captureException(error);
      this.sendToRenderer('show-notification', {
        type: 'error',
        message: `Calibration failed: ${error.message}`,
      });
      this.uiManager.enableBackButton();
      this.uiManager.enableCalibrationButton();
      this.uiManager.hideStopCalibrationButton();
      return { success: false, error: error.message };
    }
  }

  async validateDevicesForCalibration() {
    const connectedDevices = this.globalState.getConnectedDevices();
    console.log(`Calibration check: ${connectedDevices.length} devices`);

    if (connectedDevices.length === 0) {
      throw new Error('No connected devices available for calibration');
    }

    // Check each device's readiness
    const allDevicesReady = connectedDevices.every(device => {
      const status = this.globalState.getDeviceStatus(device.id);
      const isReady = status?.status === 'ready' && device.peripheral && device.peripheral.state === 'connected';
      if (!isReady) {
        console.log(`Device ${device.id} not ready: status=${status?.status}, peripheral=${device.peripheral?.state}`);
      }
      return isReady;
    });

    if (!allDevicesReady) {
      throw new Error('Not all devices are ready for calibration');
    }

    return connectedDevices;
  }

  async setupCalibrationUI() {
    this.globalState.isCalibrationActive = true;
    this.uiManager.disableBackButton();
    this.uiManager.disableCalibrationButton();
    this.uiManager.showAndEnableStopCalibrationButton();
    this.uiManager.hideResultsButton();
    this.uiManager.clearCalibrationLogs();
    this.uiManager.clearKrakenSweepData();
    this.uiManager.updateDeviceWidgetsForCalibration(true);
  }

  async prepareFlukeAndDevices() {
    try {
      const telnetResponse = await this.flukeManager.connect();
      if (telnetResponse.success) {
        await this.flukeManager.runPreReqs();
      } else {
        // Connection failed - stop calibration and show error
        this.globalState.isCalibrationActive = false;
        this.uiManager.showLogOnScreen('❌ Calibration stopped due to Fluke connection failure.');

        // Reset UI state to allow retry
        this.uiManager.enableBackButton();
        this.uiManager.enableCalibrationButton();
        this.uiManager.hideStopCalibrationButton();
        this.uiManager.resetDeviceWidgetsToNotCalibrated(); // Reset to original "Not Calibrated" state
        this.uiManager.updateCalibrationButtonState(); // Re-enable calibration button based on device readiness

        throw new Error('Fluke connection failed - calibration cannot proceed');
      }
      await this.flukeManager.ensureZeroPressure();
      this.uiManager.showLogOnScreen('2s delay...');
      await addDelay(2000);
      await this.globalState.unSubscribeAllkrakens();
    } catch (error) {
      // Handle any other errors during Fluke preparation
      this.globalState.isCalibrationActive = false;
      this.uiManager.showLogOnScreen(`❌ Calibration stopped: ${error.error}`);

      // Reset UI state to allow retry
      this.uiManager.enableBackButton();
      this.uiManager.enableCalibrationButton();
      this.uiManager.hideStopCalibrationButton();
      this.uiManager.resetDeviceWidgetsToNotCalibrated(); // Reset to original "Not Calibrated" state
      this.uiManager.updateCalibrationButtonState(); // Re-enable calibration button based on device readiness

      throw error;
    }
  }

  async executeCalibration() {
    await this.calibrationManager.calibrateAllSensors();

    // Check if calibration was stopped due to failures
    if (!this.globalState.isCalibrationActive) {
      return;
    }
  }

  async completeCalibration() {
    // Calibration completed successfully - but keep calibration active until pressure is zeroed
    await this.deviceSetupManager.reSetupKrakensAfterCalibration();
    this.uiManager.updateDeviceWidgetsForCalibration(false);

    // Mark calibration as inactive - verification will handle Fluke zero setting
    this.globalState.isCalibrationActive = false;

    // Show success notification
    this.sendToRenderer('show-notification', {
      type: 'success',
      message: 'Calibration completed successfully!',
    });

    // Update UI for successful completion
    this.sendToRenderer('hide-kraken-stop-calibration-button');
    this.sendToRenderer('enable-kraken-back-button');
    this.sendToRenderer('hide-kraken-calibration-button');
    this.sendToRenderer('show-kraken-verification-button');

    // Log completion messages
    this.uiManager.showLogOnScreen('📋 Devices are ready for verification process');
  }

  /**
   * Start the verification process
   */
  async startVerification() {
    this.globalState.isVerificationActive = true;
    this.sendToRenderer('hide-kraken-verification-button');
    this.sendToRenderer('show-kraken-stop-verification-button');
    this.sendToRenderer('disable-kraken-back-button');

    // Set the tester name in the verification service for PDF generation
    if (this.testerName) {
      this.verificationService.setTesterName(this.testerName);
    }

    let verificationSuccessful = false;

    try {
      await this.verificationService.startVerification();
      verificationSuccessful = true;
    } catch (error) {
      Sentry.captureException(error);
      this.uiManager.showLogOnScreen(`❌ Error during verification: ${error.message}`);
      verificationSuccessful = false;
    } finally {
      // Always reset state when verification completes or fails
      this.globalState.isVerificationActive = false;
      this.sendToRenderer('hide-kraken-stop-verification-button');
      this.sendToRenderer('enable-kraken-back-button');

      // Only show verification button again if there was an error
      if (!verificationSuccessful) {
        this.sendToRenderer('show-kraken-verification-button');
      } else {
        // Show success toast notification
        this.sendToRenderer('show-notification', {
          type: 'success',
          message: 'Verification completed successfully',
        });
        await addDelay(4000); // Short delay before showing results button

        this.sendToRenderer('show-notification', {
          type: 'success',
          message: `Kraken PDFs are saved successfully to your desktop`,
        });
      }
    }
  }

  /**
   * Stop the verification process
   */
  async stopVerification() {
    console.log('Stop verification called, isVerificationActive:', this.globalState.isVerificationActive);

    // Always update UI state when stop is called, regardless of flag state
    this.globalState.isVerificationActive = false;

    try {
      await this.verificationService.stopVerification();
    } catch (error) {
      console.error('Error stopping verification service:', error);
      // Continue with UI update even if service fails
    }

    // Always update UI state
    this.sendToRenderer('show-kraken-verification-button');
    this.sendToRenderer('hide-kraken-stop-verification-button');
    this.sendToRenderer('enable-kraken-back-button');
    this.uiManager.showLogOnScreen('⏹️ Verification process stopped by user.');

    console.log('Verification stopped and UI updated');
  }

  /**
   * Stop calibration process and show user notification
   * @param {string} reason - Reason for stopping calibration
   * @param {string} errorDetails - Additional error details
   * @param {boolean} resetToNotCalibrated - Whether to reset devices to "Not Calibrated" state (for retry)
   */
  async stopCalibration(reason, errorDetails = '', resetToNotCalibrated = false) {
    return this.calibrationManager.stopCalibration(reason, errorDetails, resetToNotCalibrated);
  }

  // Delegation methods to managers
  async retryDeviceSetup(deviceId) {
    return this.deviceSetupManager.retryDeviceSetup(deviceId);
  }

  async reconnectDisconnectedDevice(deviceId) {
    return this.connectivityManager.reconnectDisconnectedDevice(deviceId);
  }

  async manuallyDisconnectDevice(deviceId) {
    return this.connectivityManager.manuallyDisconnectDevice(deviceId);
  }

  getStatus() {
    return this.uiManager.getStatus();
  }

  formatDeviceForRenderer(device) {
    return this.uiManager.formatDeviceForRenderer(device);
  }

  /**
   * Send message to renderer process
   * @param {string} channel - IPC channel name
   * @param {any} data - Data to send
   */
  sendToRenderer(channel, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Cleanup all resources and connections
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      console.log('Starting calibration controller cleanup...');

      // Stop connectivity monitoring
      this.connectivityManager.stopConnectivityMonitoring();

      // Disconnect from Fluke if connected
      if (this.flukeManager) {
        console.log('Disconnecting from Fluke...');
        await this.flukeManager.disconnect();
        console.log('Fluke disconnected successfully');
      }

      // Cleanup global state
      await this.globalState.cleanup();

      console.log('Calibration controller cleanup completed');
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error during calibration controller cleanup:', error);
      // Continue cleanup even if Fluke disconnection fails
      await this.globalState.cleanup();
    }
  }
}

export { KrakenCalibrationController };
