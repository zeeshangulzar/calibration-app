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
  krakenCalibrationGoBack: () => ipcRenderer.send('kraken-calibration-go-back'),
  krakenCalibrationCleanup: () => ipcRenderer.send('kraken-calibration-cleanup'),

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
  updateAssembledSensor: (data) =>
    ipcRenderer.send('update-assembled-sensor', data),
  checkDuplicateQR: (data) => ipcRenderer.invoke('check-duplicate-qr', data),

  //======== Settings APIs ========
  loadSettings: () => ipcRenderer.send('load-settings'),
  settingsGoBack: () => ipcRenderer.send('settings-go-back'),

  // Fluke settings (backward compatibility)
  getFlukeSettings: () => ipcRenderer.invoke('settings-get-fluke-settings'),
  saveFlukeSettings: (ip, port) => ipcRenderer.invoke('settings-save-fluke-settings', ip, port),

  // Database operations (new API)
  db: {
    getFlukeSettings: () => ipcRenderer.invoke('db:get-fluke-settings'),
    saveFlukeSettings: (ip, port) => ipcRenderer.invoke('db:save-fluke-settings', { ip, port }),
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
  onShowKrakenCalibrationButton: callback => ipcRenderer.on('show-kraken-calibration-button', () => callback()),
  onHideKrakenCalibrationButton: callback => ipcRenderer.on('hide-kraken-calibration-button', () => callback()),
  onDeviceCalibrationStatusUpdate: callback => ipcRenderer.on('device-calibration-status-update', (_, data) => callback(data)),

  // Back button events
  onDisableKrakenBackButton: callback => ipcRenderer.on('disable-kraken-back-button', () => callback()),
  onEnableKrakenBackButton: callback => ipcRenderer.on('enable-kraken-back-button', () => callback()),

  // Stop calibration button events
  onShowKrakenStopCalibrationButton: callback => ipcRenderer.on('show-kraken-stop-calibration-button', () => callback()),
  onHideKrakenStopCalibrationButton: callback => ipcRenderer.on('hide-kraken-stop-calibration-button', () => callback()),
  onEnableKrakenStopCalibrationButton: callback => ipcRenderer.on('enable-kraken-stop-calibration-button', () => callback()),

  // Notifications
  onShowNotification: callback => ipcRenderer.on('show-notification', (_, data) => callback(data)),
});
