const { contextBridge, ipcRenderer } = require('electron');

// Simple crash tracking for preload
try {
  const Sentry = require('@sentry/electron/preload');
  const SENTRY_DSN = process.env.SENTRY_DSN || '';

  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 0,
      autoSessionTracking: false,
    });

    process.on('uncaughtException', error => {
      Sentry.captureException(error);
    });

    process.on('unhandledRejection', reason => {
      Sentry.captureException(new Error(`Unhandled Rejection: ${reason}`));
    });
  }
} catch {
  // Silently fail if Sentry setup fails
}

contextBridge.exposeInMainWorld('electronAPI', {
  //======== Core Application APIs ========
  loadHomeScreen: () => ipcRenderer.send('load-home-screen'),
  onShowAppVersion: callback =>
    ipcRenderer.on('show-app-version', (event, version) => callback(version)),
  getMigrationStatus: () => ipcRenderer.invoke('get-migration-status'),

  //======== Kraken List APIs ========
  loadKrakenList: () => {
    ipcRenderer.send('load-kraken-list');
  },
  krakenStartScan: () => ipcRenderer.invoke('kraken-start-scan'),
  krakenStopScan: () => ipcRenderer.invoke('kraken-stop-scan'),
  krakenRefreshScan: () => ipcRenderer.invoke('kraken-refresh-scan'),
  krakenConnectDevices: deviceIds => ipcRenderer.invoke('kraken-connect-devices', deviceIds),
  krakenSetSelectedDevices: deviceIds => ipcRenderer.send('kraken-set-selected-devices', deviceIds),
  krakenProceedToCalibration: () => ipcRenderer.invoke('kraken-proceed-to-calibration'),
  krakenGetDiscoveredDevices: () => ipcRenderer.invoke('kraken-get-discovered-devices'),
  krakenGetConnectedDevices: () => ipcRenderer.invoke('kraken-get-connected-devices'),
  krakenGetScanStatus: () => ipcRenderer.invoke('kraken-get-scan-status'),
  krakenGetConnectionStatus: () => ipcRenderer.invoke('kraken-get-connection-status'),

  // Event listeners for kraken functionality
  onBluetoothStateChanged: callback => ipcRenderer.on('bluetooth-state-changed', (_, state) => callback(state)),
  onShowBluetoothError: callback => ipcRenderer.on('show-bluetooth-error', (_, data) => callback(data)),
  onDeviceDiscovered: callback => ipcRenderer.on('device-discovered', (_, device) => callback(device)),
  onDeviceUpdated: callback => ipcRenderer.on('device-updated', (_, device) => callback(device)),
  onDeviceConnected: callback => ipcRenderer.on('device-connected', (_, device) => callback(device)),
  onConnectionFailed: callback => ipcRenderer.on('connection-failed', (_, data) => callback(data)),
  onShowConnectionErrors: callback => ipcRenderer.on('show-connection-errors', (_, data) => callback(data)),

  // Sequential connection progress events
  onDeviceConnectionStarted: callback => ipcRenderer.on('device-connection-started', (_, data) => callback(data)),
  onDeviceConnectionSuccess: callback => ipcRenderer.on('device-connection-success', (_, data) => callback(data)),
  onDeviceConnectionFailed: callback => ipcRenderer.on('device-connection-failed', (_, data) => callback(data)),
  onDeviceConnectionRetry: callback => ipcRenderer.on('device-connection-retry', (_, data) => callback(data)),
  onNavigateToCalibration: callback => ipcRenderer.on('navigate-to-calibration', (_, data) => callback(data)),
  onEnableConnectCooldown: callback => ipcRenderer.on('enable-connect-cooldown', (_, data) => callback(data)),

  // Kraken cleanup event listeners (like old app)
  onKrakenCleanupStarted: callback => ipcRenderer.on('kraken-cleanup-started', () => callback()),
  onKrakenCleanupCompleted: callback => ipcRenderer.on('kraken-cleanup-completed', () => callback()),
  onShowLoader: callback => ipcRenderer.on('show-loader', () => callback()),
  onHideLoader: callback => ipcRenderer.on('hide-loader', () => callback()),
  onScanStarted: callback => ipcRenderer.on('scan-started', () => callback()),
  onScanStopped: callback => ipcRenderer.on('scan-stopped', () => callback()),
  onScanError: callback => ipcRenderer.on('scan-error', (_, error) => callback(error)),
  onScanRefreshed: callback => ipcRenderer.on('scan-refreshed', () => callback()),
  cleanupKrakenList: () => ipcRenderer.send('cleanup-kraken-list'),

  //======== Kraken Calibration APIs ========
  loadKrakenCalibration: connectedDeviceIds => ipcRenderer.send('load-kraken-calibration', connectedDeviceIds),
  krakenCalibrationRetryDevice: deviceId => ipcRenderer.invoke('kraken-calibration-retry-device', deviceId),
  krakenCalibrationReconnectDevice: deviceId => ipcRenderer.invoke('kraken-calibration-reconnect-device', deviceId),
  krakenCalibrationDisconnectDevice: deviceId => ipcRenderer.invoke('kraken-calibration-disconnect-device', deviceId),
  krakenCalibrationStart: testerName => ipcRenderer.invoke('kraken-calibration-start', testerName),
  krakenCalibrationStop: () => ipcRenderer.invoke('kraken-calibration-stop'),
  krakenVerificationStart: testerName => ipcRenderer.invoke('kraken-verification-start', testerName),
  krakenCalibrationGetStatus: () => ipcRenderer.invoke('kraken-calibration-get-status'),
  krakenCalibrationGoBack: () => ipcRenderer.invoke('kraken-calibration-go-back'),
  krakenCalibrationCleanup: () => ipcRenderer.send('kraken-calibration-cleanup'),
  krakenCalibrationStartVerification: () => ipcRenderer.invoke('kraken-calibration-start-verification'),
  krakenCalibrationStopVerification: () => ipcRenderer.invoke('kraken-calibration-stop-verification'),
  krakenCalibrationViewPDF: deviceId => ipcRenderer.invoke('kraken-calibration-view-pdf', deviceId),

  // Kraken calibration event listeners
  onShowPageLoader: callback => ipcRenderer.on('show-page-loader', () => callback()),
  onHidePageLoader: callback => ipcRenderer.on('hide-page-loader', () => callback()),
  onInitializeDevices: callback => ipcRenderer.on('initialize-devices', (_, devices) => callback(devices)),
  onDeviceSetupStarted: callback => ipcRenderer.on('device-setup-started', (_, data) => callback(data)),
  onDeviceSetupStage: callback => ipcRenderer.on('device-setup-stage', (_, data) => callback(data)),
  onDeviceSetupComplete: callback => ipcRenderer.on('device-setup-complete', (_, data) => callback(data)),
  onDeviceSetupFailed: callback => ipcRenderer.on('device-setup-failed', (_, data) => callback(data)),
  onDeviceSetupRetry: callback => ipcRenderer.on('device-setup-retry', (_, data) => callback(data)),
  onDeviceSetupFailedFinal: callback => ipcRenderer.on('device-setup-failed-final', (_, data) => callback(data)),
  onDeviceManualRetryStarted: callback => ipcRenderer.on('device-manual-retry-started', (_, data) => callback(data)),
  onDeviceManualRetrySuccess: callback => ipcRenderer.on('device-manual-retry-success', (_, data) => callback(data)),
  onDeviceManualRetryFailed: callback => ipcRenderer.on('device-manual-retry-failed', (_, data) => callback(data)),
  onKrakenDetailsUpdated: callback => ipcRenderer.on('kraken-details-updated', (_, data) => callback(data)),
  onDeviceStatusUpdate: callback => ipcRenderer.on('device-status-update', (_, data) => callback(data)),
  onProgressUpdate: callback => ipcRenderer.on('progress-update', (_, data) => callback(data)),
  onAllDevicesReady: callback => ipcRenderer.on('all-devices-ready', () => callback()),
  onDeviceDataUpdate: callback => ipcRenderer.on('device-data-update', (_, data) => callback(data)),
  onDeviceDisconnected: callback => ipcRenderer.on('device-disconnected', (_, data) => callback(data)),
  onDeviceConnectivityLost: callback => ipcRenderer.on('device-connectivity-lost', (_, data) => callback(data)),
  onDeviceReconnectionStarted: callback => ipcRenderer.on('device-reconnection-started', (_, data) => callback(data)),
  onDeviceReconnectionSuccess: callback => ipcRenderer.on('device-reconnection-success', (_, data) => callback(data)),
  onDeviceReconnectionFailed: callback => ipcRenderer.on('device-reconnection-failed', (_, data) => callback(data)),
  onDeviceManualDisconnectStarted: callback => ipcRenderer.on('device-manual-disconnect-started', (_, data) => callback(data)),
  onDeviceManualDisconnectSuccess: callback => ipcRenderer.on('device-manual-disconnect-success', (_, data) => callback(data)),
  onDeviceManualDisconnectFailed: callback => ipcRenderer.on('device-manual-disconnect-failed', (_, data) => callback(data)),
  onUpdateCalibrationButtonState: callback => ipcRenderer.on('update-calibration-button-state', (_, data) => callback(data)),
  onCalibrationStarted: callback => ipcRenderer.on('calibration-started', () => callback()),
  onKrakenNameUpdated: callback => ipcRenderer.on('kraken-name-updated', (_, data) => callback(data)),

  //======== Assembly Sensor APIs ========
  assemblySensors: () => ipcRenderer.invoke('assembly-sensors'),
  getAssembledSensors: (args) =>
    ipcRenderer.invoke('get-assembled-sensors', args),
  saveAssembledSensor: (data) =>
    ipcRenderer.send('save-assembled-sensor', data),
  onAssembledSaved: (callback) =>
    ipcRenderer.on('assembled-saved', (_event, action) => {
      callback(action);
    }),
  deleteAssembledSensor: (id) =>
    ipcRenderer.send('delete-assembled-sensor', id),
  checkDuplicateQR: (data) => ipcRenderer.invoke('check-duplicate-qr', data),

  //======== Settings APIs ========
  loadSettings: () => ipcRenderer.send('load-settings'),
  settingsGoBack: () => ipcRenderer.send('settings-go-back'),

  // Fluke settings (backward compatibility)
  getFlukeSettings: () => ipcRenderer.invoke('settings-get-fluke-settings'),
  saveFlukeSettings: (ip, port, mockFlukeEnabled) => ipcRenderer.invoke('settings-save-fluke-settings', ip, port, mockFlukeEnabled),

  // Database operations (new API)
  db: {
    getFlukeSettings: () => ipcRenderer.invoke('db:get-fluke-settings'),
    saveFlukeSettings: (ip, port, mockFlukeEnabled) => ipcRenderer.invoke('db:save-fluke-settings', { ip, port, mockFlukeEnabled }),
    addCommandToHistory: (type, content, relatedCommand) => ipcRenderer.invoke('db:add-command-to-history', { type, content, relatedCommand }),
    getCommandHistory: limit => ipcRenderer.invoke('db:get-command-history', { limit }),
    clearCommandHistory: () => ipcRenderer.invoke('db:clear-command-history'),
  },

  // Fluke connection
  testFlukeConnection: () => ipcRenderer.invoke('settings-test-fluke-connection'),
  connectFluke: () => ipcRenderer.invoke('settings-connect-fluke'),
  disconnectFluke: () => ipcRenderer.invoke('settings-disconnect-fluke'),
  getFlukeStatus: () => ipcRenderer.invoke('settings-get-fluke-status'),

  // Fluke commands
  sendFlukeCommand: command => ipcRenderer.invoke('settings-send-fluke-command', command),
  getCommandHistory: limit => ipcRenderer.invoke('settings-get-command-history', limit),
  clearCommandHistory: () => ipcRenderer.invoke('settings-clear-command-history'),

  // Settings event listeners
  onSettingsLoaded: callback => ipcRenderer.on('settings-loaded', (_, settings) => callback(settings)),
  onSettingsSaved: callback => ipcRenderer.on('settings-saved', (_, settings) => callback(settings)),
  onFlukeConnected: callback => ipcRenderer.on('fluke-connected', (_, data) => callback(data)),
  onFlukeDisconnected: callback => ipcRenderer.on('fluke-disconnected', () => callback()),
  onFlukeError: callback => ipcRenderer.on('fluke-error', (_, data) => callback(data)),
  onFlukeTestResult: callback => ipcRenderer.on('fluke-test-result', (_, result) => callback(result)),
  onFlukeCommandSent: callback => ipcRenderer.on('fluke-command-sent', (_, data) => callback(data)),
  onFlukeResponse: callback => ipcRenderer.on('fluke-response', (_, data) => callback(data)),
  onCommandHistoryCleared: callback => ipcRenderer.on('command-history-cleared', () => callback()),

  // Kraken Calibration
  onKrakenCalibrationLogsData: callback => ipcRenderer.on('kraken-calibration-logs-data', (_, data) => callback(data)),
  onDisableKrakenCalibrationStartButton: callback => ipcRenderer.on('disable-kraken-calibration-start-button', () => callback()),
  onEnableKrakenCalibrationButton: callback => ipcRenderer.on('enable-kraken-calibration-button', () => callback()),
  onShowKrakenVerificationButton: callback => ipcRenderer.on('show-kraken-verification-button', () => callback()),
  onHideKrakenVerificationButton: callback => ipcRenderer.on('hide-kraken-verification-button', () => callback()),
  onKrakenVerificationStarted: callback => ipcRenderer.on('kraken-verification-started', () => callback()),
  onKrakenVerificationSweepCompleted: callback => ipcRenderer.on('kraken-verification-sweep-completed', (_, data) => callback(data)),
  onKrakenVerificationRealtimeUpdate: callback => ipcRenderer.on('kraken-verification-realtime-update', (_, data) => callback(data)),

  onUpdateKrakenCalibrationReferencePressure: callback => ipcRenderer.on('update-kraken-calibration-reference-pressure', (_, pressure) => callback(pressure)),
  onUpdateKrakenPressure: callback => ipcRenderer.on('update-kraken-pressure', (_, data) => callback(data)),
  onShowKrakenCalibrationButton: callback => ipcRenderer.on('show-kraken-calibration-button', () => callback()),
  onHideKrakenCalibrationButton: callback => ipcRenderer.on('hide-kraken-calibration-button', () => callback()),
  onDeviceCalibrationStatusUpdate: callback => ipcRenderer.on('device-calibration-status-update', (_, data) => callback(data)),
  onDeviceVerificationStatusUpdate: callback => ipcRenderer.on('device-verification-status-update', (_, data) => callback(data)),
  onCertificationStatusUpdate: callback => ipcRenderer.on('certification-status-update', (_, data) => callback(data)),

  // Back button events
  onDisableKrakenBackButton: callback => ipcRenderer.on('disable-kraken-back-button', () => callback()),
  onEnableKrakenBackButton: callback => ipcRenderer.on('enable-kraken-back-button', () => callback()),

  // Stop calibration button events
  onShowKrakenStopCalibrationButton: callback => ipcRenderer.on('show-kraken-stop-calibration-button', () => callback()),
  onHideKrakenStopCalibrationButton: callback => ipcRenderer.on('hide-kraken-stop-calibration-button', () => callback()),
  onEnableKrakenStopCalibrationButton: callback => ipcRenderer.on('enable-kraken-stop-calibration-button', () => callback()),

  // Stop verification button events
  onShowKrakenStopVerificationButton: callback => ipcRenderer.on('show-kraken-stop-verification-button', () => callback()),
  onHideKrakenStopVerificationButton: callback => ipcRenderer.on('hide-kraken-stop-verification-button', () => callback()),

  // Notifications
  onShowNotification: callback => ipcRenderer.on('show-notification', (_, data) => callback(data)),

  //======== Developer Settings APIs ========
  validateDeveloperPassword: password => ipcRenderer.invoke('developer-settings-validate-password', password),
  getDeveloperSettings: () => ipcRenderer.invoke('developer-settings-get'),
  saveDeveloperSettings: settings => ipcRenderer.invoke('developer-settings-save', settings),
  developerSettingsGoBack: () => ipcRenderer.send('developer-settings-go-back'),

  //======== Monster Meter APIs ========
  loadMonsterMeter: () => ipcRenderer.send('load-monster-meter'),
  monsterMeterGoBack: () => ipcRenderer.send('monster-meter-go-back'),
  monsterMeterRefreshPorts: () => ipcRenderer.invoke('monster-meter-refresh-ports'),
  monsterMeterConnectPort: portPath => ipcRenderer.invoke('monster-meter-connect-port', portPath),
  monsterMeterDisconnect: () => ipcRenderer.invoke('monster-meter-disconnect'),
  monsterMeterGetStatus: () => ipcRenderer.invoke('monster-meter-get-status'),
  monsterMeterReadData: () => ipcRenderer.invoke('monster-meter-read-data'),
  monsterMeterTestCommunication: () => ipcRenderer.invoke('monster-meter-test-communication'),
  monsterMeterGetUsbDevices: () => ipcRenderer.invoke('monster-meter-get-usb-devices'),
  monsterMeterCleanup: () => ipcRenderer.invoke('monster-meter-cleanup'),
  monsterMeterCleanupModule: () => ipcRenderer.invoke('monster-meter-cleanup-module'),

  // Monster Meter calibration
  monsterMeterStartCalibration: (testerName, model, serialNumber) => ipcRenderer.invoke('monster-meter-start-calibration', testerName, model, serialNumber),
  monsterMeterStopCalibration: reason => ipcRenderer.invoke('monster-meter-stop-calibration', reason),
  monsterMeterGetCalibrationStatus: () => ipcRenderer.invoke('monster-meter-get-calibration-status'),
  monsterMeterStartVerification: (testerName, model, serialNumber) => ipcRenderer.invoke('monster-meter-start-verification', testerName, model, serialNumber),
  monsterMeterStopVerification: reason => ipcRenderer.invoke('monster-meter-stop-verification', reason),
  monsterMeterGetVerificationStatus: () => ipcRenderer.invoke('monster-meter-get-verification-status'),

  // Monster Meter event listeners
  onMonsterMeterPortsUpdated: callback => ipcRenderer.on('monster-meter-ports-updated', (_, ports) => callback(ports)),
  onMonsterMeterConnected: callback => ipcRenderer.on('monster-meter-connected', (_, data) => callback(data)),
  onMonsterMeterDisconnected: callback => ipcRenderer.on('monster-meter-disconnected', (_, data) => callback(data)),
  onMonsterMeterConnectionError: callback => ipcRenderer.on('monster-meter-connection-error', (_, data) => callback(data)),
  onMonsterMeterDataUpdated: callback => ipcRenderer.on('monster-meter-data-updated', (_, data) => callback(data)),
  onMonsterMeterError: callback => ipcRenderer.on('monster-meter-error', (_, data) => callback(data)),
  onMonsterMeterLog: callback => ipcRenderer.on('monster-meter-log', (_, message) => callback(message)),
  onMonsterMeterCalibrationStarted: callback => ipcRenderer.on('monster-meter-calibration-started', (_, data) => callback(data)),
  onMonsterMeterCalibrationStopped: callback => ipcRenderer.on('monster-meter-calibration-stopped', (_, data) => callback(data)),
  onMonsterMeterCalibrationFailed: callback => ipcRenderer.on('monster-meter-calibration-failed', (_, data) => callback(data)),
  onMonsterMeterCalibrationCompleted: callback => ipcRenderer.on('monster-meter-calibration-completed', (_, data) => callback(data)),
  onMonsterMeterCalibrationData: callback => ipcRenderer.on('monster-meter-calibration-data', (_, data) => callback(data)),
  onMonsterMeterLiveData: callback => ipcRenderer.on('monster-meter-live-data', (_, data) => callback(data)),
  onMonsterMeterVerificationStarted: callback => ipcRenderer.on('monster-meter-verification-started', (_, data) => callback(data)),
  onMonsterMeterVerificationStopped: callback => ipcRenderer.on('monster-meter-verification-stopped', (_, data) => callback(data)),
  onMonsterMeterVerificationFailed: callback => ipcRenderer.on('monster-meter-verification-failed', (_, data) => callback(data)),
  onMonsterMeterVerificationCompleted: callback => ipcRenderer.on('monster-meter-verification-completed', (_, data) => callback(data)),
  onMonsterMeterVerificationData: callback => ipcRenderer.on('monster-meter-verification-data', (_, data) => callback(data)),
  onMonsterMeterPDFGenerated: callback => ipcRenderer.on('monster-meter-pdf-generated', (_, data) => callback(data)),

  // File operations
  openPDF: filePath => ipcRenderer.invoke('open-pdf', filePath),

  // Monster Meter cleanup
  removeAllMonsterMeterListeners: () => {
    ipcRenderer.removeAllListeners('monster-meter-ports-updated');
    ipcRenderer.removeAllListeners('monster-meter-connected');
    ipcRenderer.removeAllListeners('monster-meter-disconnected');
    ipcRenderer.removeAllListeners('monster-meter-connection-error');
    ipcRenderer.removeAllListeners('monster-meter-data-updated');
    ipcRenderer.removeAllListeners('monster-meter-error');
    ipcRenderer.removeAllListeners('monster-meter-log');
    ipcRenderer.removeAllListeners('monster-meter-calibration-started');
    ipcRenderer.removeAllListeners('monster-meter-calibration-stopped');
    ipcRenderer.removeAllListeners('monster-meter-calibration-failed');
    ipcRenderer.removeAllListeners('monster-meter-calibration-completed');
    ipcRenderer.removeAllListeners('monster-meter-calibration-data');
    ipcRenderer.removeAllListeners('monster-meter-live-data');
    ipcRenderer.removeAllListeners('monster-meter-verification-started');
    ipcRenderer.removeAllListeners('monster-meter-verification-stopped');
    ipcRenderer.removeAllListeners('monster-meter-verification-failed');
    ipcRenderer.removeAllListeners('monster-meter-verification-completed');
    ipcRenderer.removeAllListeners('monster-meter-verification-data');
  },
});
