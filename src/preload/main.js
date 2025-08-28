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

    process.on('unhandledRejection', (reason, promise) => {
      Sentry.captureException(new Error(`Unhandled Rejection: ${reason}`));
    });
  }
} catch (error) {
  // Silently fail if Sentry setup fails
}

contextBridge.exposeInMainWorld('electronAPI', {
  //======== Core Application APIs ========
  loadHomeScreen: () => ipcRenderer.send('load-home-screen'),
  onShowAppVersion: callback =>
    ipcRenderer.on('show-app-version', (event, version) => callback(version)),

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
  onBluetoothStateChanged: callback =>
    ipcRenderer.on('bluetooth-state-changed', (event, state) => callback(state)),
  onShowBluetoothError: callback =>
    ipcRenderer.on('show-bluetooth-error', (event, data) => callback(data)),
  onDeviceDiscovered: callback =>
    ipcRenderer.on('device-discovered', (event, device) => callback(device)),
  onDeviceUpdated: callback =>
    ipcRenderer.on('device-updated', (event, device) => callback(device)),
  onDeviceConnected: callback =>
    ipcRenderer.on('device-connected', (event, device) => callback(device)),
  onConnectionFailed: callback =>
    ipcRenderer.on('connection-failed', (event, data) => callback(data)),
  onShowConnectionErrors: callback =>
    ipcRenderer.on('show-connection-errors', (event, data) => callback(data)),

  // Sequential connection progress events
  onDeviceConnectionStarted: callback =>
    ipcRenderer.on('device-connection-started', (event, data) => callback(data)),
  onDeviceConnectionSuccess: callback =>
    ipcRenderer.on('device-connection-success', (event, data) => callback(data)),
  onDeviceConnectionFailed: callback =>
    ipcRenderer.on('device-connection-failed', (event, data) => callback(data)),
  onDeviceConnectionRetry: callback =>
    ipcRenderer.on('device-connection-retry', (event, data) => callback(data)),
  onNavigateToCalibration: callback =>
    ipcRenderer.on('navigate-to-calibration', (event, data) => callback(data)),
  onEnableConnectCooldown: callback =>
    ipcRenderer.on('enable-connect-cooldown', (event, data) => callback(data)),

  // Kraken cleanup event listeners (like old app)
  onKrakenCleanupStarted: callback => ipcRenderer.on('kraken-cleanup-started', event => callback()),
  onKrakenCleanupCompleted: callback =>
    ipcRenderer.on('kraken-cleanup-completed', event => callback()),
  onShowLoader: callback => ipcRenderer.on('show-loader', event => callback()),
  onHideLoader: callback => ipcRenderer.on('hide-loader', event => callback()),
  onScanStarted: callback => ipcRenderer.on('scan-started', event => callback()),
  onScanStopped: callback => ipcRenderer.on('scan-stopped', event => callback()),
  onScanError: callback => ipcRenderer.on('scan-error', (event, error) => callback(error)),
  onScanRefreshed: callback => ipcRenderer.on('scan-refreshed', event => callback()),
  cleanupKrakenList: () => ipcRenderer.send('cleanup-kraken-list'),

  //======== Kraken Calibration APIs ========
  loadKrakenCalibration: connectedDeviceIds =>
    ipcRenderer.send('load-kraken-calibration', connectedDeviceIds),
  krakenCalibrationRetryDevice: deviceId =>
    ipcRenderer.invoke('kraken-calibration-retry-device', deviceId),
  krakenCalibrationReconnectDevice: deviceId =>
    ipcRenderer.invoke('kraken-calibration-reconnect-device', deviceId),
  krakenCalibrationDisconnectDevice: deviceId =>
    ipcRenderer.invoke('kraken-calibration-disconnect-device', deviceId),
  krakenCalibrationStart: (sweepValue, testerName) =>
    ipcRenderer.invoke('kraken-calibration-start', sweepValue, testerName),
  krakenVerificationStart: (sweepValue, testerName) =>
    ipcRenderer.invoke('kraken-verification-start', sweepValue, testerName),
  krakenCalibrationGetStatus: () => ipcRenderer.invoke('kraken-calibration-get-status'),
  krakenCalibrationGoBack: () => ipcRenderer.send('kraken-calibration-go-back'),
  krakenCalibrationCleanup: () => ipcRenderer.send('kraken-calibration-cleanup'),

  // Kraken calibration event listeners
  onShowPageLoader: callback => ipcRenderer.on('show-page-loader', event => callback()),
  onHidePageLoader: callback => ipcRenderer.on('hide-page-loader', event => callback()),
  onInitializeDevices: callback =>
    ipcRenderer.on('initialize-devices', (event, devices) => callback(devices)),
  onDeviceSetupStarted: callback =>
    ipcRenderer.on('device-setup-started', (event, data) => callback(data)),
  onDeviceSetupStage: callback =>
    ipcRenderer.on('device-setup-stage', (event, data) => callback(data)),
  onDeviceSetupComplete: callback =>
    ipcRenderer.on('device-setup-complete', (event, data) => callback(data)),
  onDeviceSetupFailed: callback =>
    ipcRenderer.on('device-setup-failed', (event, data) => callback(data)),
  onDeviceSetupRetry: callback =>
    ipcRenderer.on('device-setup-retry', (event, data) => callback(data)),
  onDeviceSetupFailedFinal: callback =>
    ipcRenderer.on('device-setup-failed-final', (event, data) => callback(data)),
  onDeviceManualRetryStarted: callback =>
    ipcRenderer.on('device-manual-retry-started', (event, data) => callback(data)),
  onDeviceManualRetrySuccess: callback =>
    ipcRenderer.on('device-manual-retry-success', (event, data) => callback(data)),
  onDeviceManualRetryFailed: callback =>
    ipcRenderer.on('device-manual-retry-failed', (event, data) => callback(data)),
  onKrakenDetailsUpdated: callback =>
    ipcRenderer.on('kraken-details-updated', (event, data) => callback(data)),
  onDeviceStatusUpdate: callback =>
    ipcRenderer.on('device-status-update', (event, data) => callback(data)),
  onProgressUpdate: callback => ipcRenderer.on('progress-update', (event, data) => callback(data)),
  onAllDevicesReady: callback => ipcRenderer.on('all-devices-ready', event => callback()),
  onDeviceDataUpdate: callback =>
    ipcRenderer.on('device-data-update', (event, data) => callback(data)),
  onDeviceDisconnected: callback =>
    ipcRenderer.on('device-disconnected', (event, data) => callback(data)),
  onDeviceConnectivityLost: callback =>
    ipcRenderer.on('device-connectivity-lost', (event, data) => callback(data)),
  onDeviceReconnectionStarted: callback =>
    ipcRenderer.on('device-reconnection-started', (event, data) => callback(data)),
  onDeviceReconnectionSuccess: callback =>
    ipcRenderer.on('device-reconnection-success', (event, data) => callback(data)),
  onDeviceReconnectionFailed: callback =>
    ipcRenderer.on('device-reconnection-failed', (event, data) => callback(data)),
  onDeviceManualDisconnectStarted: callback =>
    ipcRenderer.on('device-manual-disconnect-started', (event, data) => callback(data)),
  onDeviceManualDisconnectSuccess: callback =>
    ipcRenderer.on('device-manual-disconnect-success', (event, data) => callback(data)),
  onDeviceManualDisconnectFailed: callback =>
    ipcRenderer.on('device-manual-disconnect-failed', (event, data) => callback(data)),
  onUpdateCalibrationButtonState: callback =>
    ipcRenderer.on('update-calibration-button-state', (event, data) => callback(data)),
  onCalibrationStarted: callback => ipcRenderer.on('calibration-started', event => callback()),

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
    addCommandToHistory: (type, content, relatedCommand) =>
      ipcRenderer.invoke('db:add-command-to-history', { type, content, relatedCommand }),
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
  onSettingsLoaded: callback =>
    ipcRenderer.on('settings-loaded', (event, settings) => callback(settings)),
  onSettingsSaved: callback =>
    ipcRenderer.on('settings-saved', (event, settings) => callback(settings)),
  onFlukeConnected: callback => ipcRenderer.on('fluke-connected', (event, data) => callback(data)),
  onFlukeDisconnected: callback => ipcRenderer.on('fluke-disconnected', event => callback()),
  onFlukeError: callback => ipcRenderer.on('fluke-error', (event, data) => callback(data)),
  onFlukeTestResult: callback =>
    ipcRenderer.on('fluke-test-result', (event, result) => callback(result)),
  onFlukeCommandSent: callback =>
    ipcRenderer.on('fluke-command-sent', (event, data) => callback(data)),
  onFlukeResponse: callback => ipcRenderer.on('fluke-response', (event, data) => callback(data)),
  onCommandHistoryCleared: callback =>
    ipcRenderer.on('command-history-cleared', event => callback()),

  // Kraken Calibration
  onKrakenCalibrationLogsData: callback =>
    ipcRenderer.on('kraken-calibration-logs-data', (event, data) => callback(data)),
  onDisableKrakenCalibrationStartButton: callback =>
    ipcRenderer.on('disable-kraken-calibration-start-button', event => callback()),
  onEnableKrakenCalibrationButton: callback =>
    ipcRenderer.on('enable-kraken-calibration-button', event => callback()),
  onShowKrakenVerificationButton: callback =>
    ipcRenderer.on('show-kraken-verification-button', event => callback()),
  onHideKrakenVerificationButton: callback =>
    ipcRenderer.on('hide-kraken-verification-button', event => callback()),
  onShowKrakenCalibrationButton: callback =>
    ipcRenderer.on('show-kraken-calibration-button', event => callback()),
  onHideKrakenCalibrationButton: callback =>
    ipcRenderer.on('hide-kraken-calibration-button', event => callback()),
  onDeviceCalibrationStatusUpdate: callback =>
    ipcRenderer.on('device-calibration-status-update', (event, data) => callback(data)),

  // Notifications
  onShowNotification: callback =>
    ipcRenderer.on('show-notification', (event, data) => callback(data)),
});
