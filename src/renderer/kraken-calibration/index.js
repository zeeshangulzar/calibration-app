// update this showCustomAlertModal  import to be like import * from as
import * as NotificationHelper from '../../shared/helpers/notification-helper.js';
import { populateSelectOptions } from '../../shared/helpers/ui-helper.js';
import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import { getLocalTimestamp } from '../../main/utils/general.utils.js';

const connectedDevices = new Map();
let allDevicesReady = false;
let isCalibrationInProgress = false;

document.addEventListener('DOMContentLoaded', () => {
  // Back button functionality
  document.getElementById('back-button-kraken-calibration').addEventListener('click', () => {
    window.electronAPI.krakenCalibrationGoBack();
  });

  populateCalibrationControls();

  // Start calibration button
  const startCalibrationBtn = document.getElementById('start-calibration-btn');
  if (startCalibrationBtn) {
    startCalibrationBtn.addEventListener('click', async () => {
      const testerName = document.getElementById('tester-name')?.value;

      if (!testerName) {
        NotificationHelper.showCustomAlertModal('Please select Tester Name before starting calibration.');
        return;
      }
      if (allDevicesReady) {
        try {
          await window.electronAPI.krakenCalibrationStart(testerName);
          // if (!result.success) {
          //   NotificationHelper.showError(`Failed to start calibration: ${result.error}`);
          // }
        } catch (error) {
          NotificationHelper.showError(`Error starting calibration: ${error.message}`);
        }
      }
    });
  }

  // Start verification button
  const startVerificationBtn = document.getElementById('start-verification-btn');
  if (startVerificationBtn) {
    startVerificationBtn.addEventListener('click', async () => {
      try {
        // Initialize verification results container
        initializeVerificationResults();

        await window.electronAPI.krakenCalibrationStartVerification();
      } catch (error) {
        NotificationHelper.showError(`Error starting verification: ${error.message}`);
      }
    });
  }

  // Stop verification button
  const stopVerificationBtn = document.getElementById('stop-verification-button');
  if (stopVerificationBtn) {
    stopVerificationBtn.addEventListener('click', async () => {
      try {
        await window.electronAPI.krakenCalibrationStopVerification();
      } catch (error) {
        NotificationHelper.showError(`Error stopping verification: ${error.message}`);
      }
    });
  }

  // Remove verification results button FOR DEV ONLY
  // const removeVerificationBtn = document.getElementById('remove-verification-button');
  // if (removeVerificationBtn) {
  //   removeVerificationBtn.addEventListener('click', () => {
  //     const resultsContainer = document.getElementById('verification-results-container');
  //     const resultsTableWrapper = document.getElementById('results-table-wrapper');
  //     const sensorPressuresContainer = document.getElementById('sensor-pressures');
  //     const referencePressureElement = document.getElementById('reference-pressure-value');

  //     if (resultsContainer) resultsContainer.classList.add('hidden');
  //     if (resultsTableWrapper) resultsTableWrapper.innerHTML = '';
  //     if (sensorPressuresContainer) sensorPressuresContainer.innerHTML = '';
  //     if (referencePressureElement) referencePressureElement.textContent = 'N/A';
  //   });
  // }

  // Stop calibration button
  const stopCalibrationBtn = document.getElementById('stop-calibration-button');
  if (stopCalibrationBtn) {
    stopCalibrationBtn.addEventListener('click', async () => {
      try {
        await window.electronAPI.krakenCalibrationStop();
      } catch (error) {
        NotificationHelper.showError(`Error stopping calibration: ${error.message}`);
      }
    });
  }

  // Error alert OK button
  document.getElementById('error-ok-btn').addEventListener('click', () => {
    document.getElementById('error-alert').classList.add('hidden');
  });
});

// Event listeners for calibration events
window.electronAPI.onShowPageLoader(() => {
  document.getElementById('page-loader')?.classList.remove('hidden');
  // disable refresh button
  document.getElementById('refreshBtn').disabled = true;
});

window.electronAPI.onHidePageLoader(() => {
  document.getElementById('page-loader')?.classList.add('hidden');
  // enable refresh button
  document.getElementById('refreshBtn').disabled = false;
});

// Stop verification button events
window.electronAPI.onShowKrakenStopVerificationButton(() => {
  const stopVerificationBtn = document.getElementById('stop-verification-button');
  if (stopVerificationBtn) {
    stopVerificationBtn.classList.remove('hidden');
  }
});

window.electronAPI.onHideKrakenStopVerificationButton(() => {
  const stopVerificationBtn = document.getElementById('stop-verification-button');
  if (stopVerificationBtn) {
    stopVerificationBtn.classList.add('hidden');
  }
});

window.electronAPI.onInitializeDevices(devices => {
  initializeDeviceWidgets(devices);
});

window.electronAPI.onDeviceSetupStarted(data => {
  const { deviceId } = data;
  updateDeviceWidget(deviceId, 'in-progress', 'Starting setup...');
});

window.electronAPI.onDeviceSetupStage(data => {
  const { deviceId, stage, message } = data;
  updateDeviceWidget(deviceId, 'in-progress', message, stage);
});

window.electronAPI.onDeviceSetupComplete(data => {
  const { deviceId } = data;
  updateDeviceWidget(deviceId, 'ready', 'Ready for calibration');
});

window.electronAPI.onDeviceSetupFailed(data => {
  const { deviceId, error } = data;
  updateDeviceWidget(deviceId, 'failed', error);
});

window.electronAPI.onDeviceSetupRetry(data => {
  const { deviceId, attempt, maxRetries, message } = data;
  updateDeviceWidget(deviceId, 'in-progress', `Retry ${attempt}/${maxRetries} - ${message || 'Retrying setup...'}`, 'retrying');
});

window.electronAPI.onDeviceSetupFailedFinal(data => {
  const { deviceId, error, maxRetries } = data;
  updateDeviceWidget(deviceId, 'failed', `Failed after ${maxRetries} attempts: ${error}`);
});

window.electronAPI.onDeviceManualRetryStarted(data => {
  const { deviceId } = data;
  updateDeviceWidget(deviceId, 'in-progress', 'Manual retry in progress...', 'retrying');
});

window.electronAPI.onDeviceManualRetrySuccess(data => {
  const { deviceId } = data;
  updateDeviceWidget(deviceId, 'ready', 'Ready for calibration');
});

window.electronAPI.onDeviceManualRetryFailed(data => {
  const { deviceId, error } = data;
  updateDeviceWidget(deviceId, 'failed', `Manual retry failed: ${error}`);
});

window.electronAPI.onKrakenDetailsUpdated(data => {
  const { deviceId, firmwareVersion, displayName } = data;
  updateKrakenDetails(deviceId, firmwareVersion, displayName);
});

window.electronAPI.onDeviceStatusUpdate(data => {
  const { deviceId, status } = data;
  updateDeviceFromStatus(deviceId, status);
});

window.electronAPI.onProgressUpdate(data => {
  updateProgressSummary(data);
});

window.electronAPI.onAllDevicesReady(() => {
  allDevicesReady = true;
  const startBtn = document.getElementById('start-calibration-btn');
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  // Also re-enable verification button if it's visible and was disabled due to disconnections
  const verificationBtn = document.getElementById('start-verification-btn');
  if (verificationBtn && !verificationBtn.classList.contains('hidden') && verificationBtn.disabled) {
    verificationBtn.disabled = false;
    verificationBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    verificationBtn.title = 'Start Verification';
  }

  // Update status message
  document.getElementById('connection-status').textContent = 'All devices ready for calibration';
});

window.electronAPI.onDeviceDataUpdate(data => {
  const { deviceId, pressure } = data;
  updateDevicePressureData(deviceId, pressure);
});

// Connectivity event listeners
window.electronAPI.onDeviceConnectivityLost(data => {
  const { deviceId, message } = data;
  console.log(`Device ${deviceId} lost connectivity:`, message);
  updateDeviceWidget(deviceId, 'disconnected', message);
});

window.electronAPI.onDeviceReconnectionStarted(data => {
  const { deviceId } = data;
  console.log(`Device ${deviceId} reconnection started`);
  updateDeviceWidget(deviceId, 'in-progress', 'Reconnecting...');
});

window.electronAPI.onDeviceReconnectionSuccess(data => {
  const { deviceId } = data;
  console.log(`Device ${deviceId} reconnected successfully`);
  // Status will be updated via normal device-status-update event
});

window.electronAPI.onDeviceReconnectionFailed(data => {
  const { deviceId, error } = data;
  console.log(`Device ${deviceId} reconnection failed:`, error);
  updateDeviceWidget(deviceId, 'disconnected', `Reconnection failed: ${error}`);
});

window.electronAPI.onDeviceManualDisconnectStarted(data => {
  const { deviceId } = data;
  console.log(`Device ${deviceId} manual disconnect started`);
  updateDeviceWidget(deviceId, 'in-progress', 'Removing...');

  // Disable all interactions on this widget
  const widget = document.getElementById(`device-widget-${deviceId}`);
  if (widget) {
    widget.style.pointerEvents = 'none';
    widget.style.opacity = '0.6';
    widget.classList.add('removing');

    // Add visual removing effect
    widget.style.transform = 'scale(0.95)';
    widget.style.transition = 'all 0.3s ease';
  }
});

window.electronAPI.onDeviceManualDisconnectSuccess(data => {
  const { deviceId } = data;
  console.log(`Device ${deviceId} manually disconnected and removed`);

  // Animate widget removal
  const widget = document.getElementById(`device-widget-${deviceId}`);
  if (widget) {
    // Add removal animation
    widget.style.transform = 'scale(0.8)';
    widget.style.opacity = '0';
    widget.style.transition = 'all 0.4s ease';

    // Remove widget after animation completes
    setTimeout(() => {
      if (widget.parentNode) {
        widget.remove();
      }
    }, 400);
  }

  // Show success message (temporary notification)
  NotificationHelper.showSuccess(`Kraken ${deviceId.substring(0, 8)}... removed from calibration`);
});

window.electronAPI.onDeviceManualDisconnectFailed(data => {
  const { deviceId, error } = data;
  console.log(`Device ${deviceId} manual disconnect failed:`, error);

  // Re-enable widget interactions
  const widget = document.getElementById(`device-widget-${deviceId}`);
  if (widget) {
    widget.style.pointerEvents = 'auto';
    widget.style.opacity = '1';
    widget.style.transform = 'scale(1)';
    widget.classList.remove('removing');
  }

  NotificationHelper.showError(`Failed to remove kraken: ${error}`);
});

window.electronAPI.onUpdateCalibrationButtonState(data => {
  const { enabled, deviceCount } = data;
  const startBtn = document.getElementById('start-calibration-btn');
  if (startBtn) {
    startBtn.disabled = !enabled;
    if (enabled) {
      startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
      startBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
  }

  // Update status message
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    // Do not override status while calibration is in progress
    if (!isCalibrationInProgress) {
      if (deviceCount === 0) {
        statusEl.textContent = 'No devices connected';
      } else if (enabled) {
        statusEl.textContent = 'All devices ready for calibration';
      } else {
        statusEl.textContent = 'Some devices are disconnected or not ready';
      }
    }
  }
});

window.electronAPI.onDeviceDisconnected(data => {
  const { deviceId } = data;
  handleDeviceDisconnection(deviceId);
});

window.electronAPI.onCalibrationStarted(() => {
  // Handle calibration start - disable the button
  const startBtn = document.getElementById('start-calibration-btn');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }

  // Mark calibration in progress and update status
  isCalibrationInProgress = true;
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.textContent = 'Calibration in progress...';
  }

  NotificationHelper.showInfo('Calibration started successfully!');
});

// Handle explicit button disable/enable events from main process
window.electronAPI.onDisableKrakenCalibrationStartButton(() => {
  const startBtn = document.getElementById('start-calibration-btn');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.classList.add('opacity-50', 'cursor-not-allowed');
    console.log('Calibration button disabled by main process');
  }
});

window.electronAPI.onEnableKrakenCalibrationButton(() => {
  const startBtn = document.getElementById('start-calibration-btn');
  if (startBtn && allDevicesReady) {
    startBtn.disabled = false;
    startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    console.log('Calibration button enabled by main process');
  }
});

// Back button status event listeners
window.electronAPI.onDisableKrakenBackButton(() => {
  const backButton = document.getElementById('back-button-kraken-calibration');
  if (backButton) {
    backButton.style.pointerEvents = 'none';
    backButton.style.opacity = '0.5';
    backButton.style.cursor = 'not-allowed';
  }

  // Show flash message explaining why back button is disabled
  const messageElement = document.getElementById('back-button-message-text');
  const statusMessage = document.getElementById('back-button-status-message');

  if (messageElement && statusMessage) {
    messageElement.textContent = 'Back button is disabled during calibration. It will be re-enabled when calibration completes or if an error occurs.';
    statusMessage.classList.remove('hidden');
  }
});

window.electronAPI.onEnableKrakenBackButton(() => {
  const backButton = document.getElementById('back-button-kraken-calibration');
  if (backButton) {
    backButton.style.pointerEvents = 'auto';
    backButton.style.opacity = '1';
    backButton.style.cursor = 'pointer';
  }

  // Hide flash message when back button is enabled
  const statusMessage = document.getElementById('back-button-status-message');
  if (statusMessage) {
    statusMessage.classList.add('hidden');
  }
});

// Stop calibration button event listeners
window.electronAPI.onShowKrakenStopCalibrationButton(() => {
  const stopBtn = document.getElementById('stop-calibration-button');
  if (stopBtn) {
    stopBtn.classList.remove('hidden');
  }
});

window.electronAPI.onHideKrakenStopCalibrationButton(() => {
  const stopBtn = document.getElementById('stop-calibration-button');
  if (stopBtn) {
    stopBtn.classList.add('hidden');
  }
});

window.electronAPI.onEnableKrakenStopCalibrationButton(() => {
  const stopBtn = document.getElementById('stop-calibration-button');
  if (stopBtn) {
    stopBtn.disabled = false;
    stopBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
});

// Verification button event listeners
window.electronAPI.onShowKrakenVerificationButton(() => {
  const verificationBtn = document.getElementById('start-verification-btn');
  if (verificationBtn) {
    verificationBtn.classList.remove('hidden');
  }

  // Calibration completed successfully
  isCalibrationInProgress = false;
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.textContent = 'Devices are ready for verification';
  }
});

window.electronAPI.onHideKrakenVerificationButton(() => {
  const verificationBtn = document.getElementById('start-verification-btn');
  if (verificationBtn) {
    verificationBtn.classList.add('hidden');
  }
});

window.electronAPI.onHideKrakenCalibrationButton(() => {
  const calibrationBtn = document.getElementById('start-calibration-btn');
  if (calibrationBtn) {
    calibrationBtn.classList.add('hidden');
  }
});

window.electronAPI.onShowKrakenCalibrationButton(() => {
  const calibrationBtn = document.getElementById('start-calibration-btn');
  if (calibrationBtn) {
    calibrationBtn.classList.remove('hidden');
  }
});

// Calibration status update event listener
window.electronAPI.onDeviceCalibrationStatusUpdate(data => {
  const { deviceId, isCalibrating, hasError, message } = data;
  updateDeviceCalibrationStatus(deviceId, isCalibrating, message, hasError);
});

window.electronAPI.onKrakenCalibrationLogsData(log => {
  const logContainer = document.getElementById('log-messages');

  const newLog = document.createElement('p');
  newLog.className = 'font-mono';
  newLog.textContent = `[${getLocalTimestamp()}] ${log}`;
  logContainer.appendChild(newLog);

  // Auto-scroll to bottom
  const scrollContainer = document.getElementById('calibration-log-content');
  if (scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }
});

window.electronAPI.onKrakenVerificationSweepCompleted(data => {
  console.log('Verification sweep data received:', data);
  displayVerificationResults(data);

  // Update all device widgets to show verification completed status
  Object.keys(data).forEach(deviceId => {
    updateDeviceWidget(deviceId, 'verification-completed', 'Verification completed');
  });

  // Enable the remove button after completion
  // const removeButton = document.getElementById('remove-verification-button');
  // if (removeButton) {
  //   removeButton.disabled = false;
  // }
});

// Real-time verification updates
window.electronAPI.onKrakenVerificationRealtimeUpdate(data => {
  console.log('Real-time verification update received:', data);
  updateVerificationResultsRealtime(data);
});

// Listen for certification status updates
window.electronAPI.onCertificationStatusUpdate(data => {
  const { deviceId, certificationResult } = data;
  updateDeviceCertificationStatus(deviceId, certificationResult);
});

window.electronAPI.onUpdateKrakenCalibrationReferencePressure(pressure => {
  updateKrakenCalibrationReferencePressure(pressure);
});

window.electronAPI.onUpdateKrakenPressure(data => {
  updateKrakenPressure(data);
});

// Handle notifications from main process
window.electronAPI.onShowNotification(data => {
  const { type, message } = data;

  // Use the existing NotificationHelper to show notifications
  switch (type) {
    case 'info':
      NotificationHelper.showInfo(message);
      break;
    case 'success':
      NotificationHelper.showSuccess(message);
      break;
    case 'warning':
      NotificationHelper.showError(message); // Using error for warnings to make them visible
      break;
    case 'error':
      NotificationHelper.showError(message);
      break;
    default:
      NotificationHelper.showInfo(message);
  }

  // Also log to console for debugging
  console.log(`[Notification ${type.toUpperCase()}] ${message}`);
});

// Initialize device widgets in the grid
function initializeDeviceWidgets(devices) {
  const devicesGrid = document.getElementById('devices-grid');
  if (!devicesGrid) return;

  // Clear existing widgets
  devicesGrid.innerHTML = '';
  connectedDevices.clear();

  devices.forEach(device => {
    connectedDevices.set(device.id, device);
    const widget = createDeviceWidget(device);
    devicesGrid.appendChild(widget);

    // Initialize with "not calibrated" status
    updateDeviceCalibrationStatus(device.id, false, 'Not Calibrated');
  });

  // Update progress summary
  updateProgressSummary({
    total: devices.length,
    ready: 0,
    failed: 0,
    pending: devices.length,
    progress: 0,
  });
}

// Create individual device widget (using old app design)
function createDeviceWidget(device) {
  const widget = document.createElement('div');
  widget.id = `device-widget-${device.id}`;
  widget.className = 'rounded-md border bg-white p-4 shadow-sm transition-all duration-200';

  widget.innerHTML = `
    <!-- Header with disconnect button -->
    <div class="flex justify-between items-start mb-2">
      <h4 class="font-medium device-name">Sensor ${device.displayName}</h4>
      <button 
        onclick="disconnectDevice('${device.id}')"
        class="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full p-1 transition-colors duration-200"
        title="Disconnect and remove this kraken">
        <i class="fa-solid fa-times text-sm"></i>
      </button>
    </div>
    
    <div class="mb-1 text-sm text-neutral-500" id="device-status-message-${device.id}">Pending...</div>
    <div class="w-full bg-neutral-200 h-2 rounded-full overflow-hidden mb-3">
      <div id="device-progress-${device.id}" class="bg-neutral-800 h-2 rounded-full transition-all duration-500" style="width: 0%;"></div>
    </div>
    
    <!-- Device Info -->
    <div class="text-xs text-neutral-500 mb-2">
      <div>ID: ${device.id}</div>
      <div>Firmware: <span class="device-firmware">${device.firmwareVersion}</span></div>
    </div>

    <!-- Action Area -->
    <div id="device-action-${device.id}" class="hidden mt-3 space-y-2">
      <button 
        onclick="retryDeviceSetup('${device.id}')"
        class="w-full px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors duration-200 text-sm">
        <i class="fa-solid fa-retry mr-1"></i> Retry Setup
      </button>
    </div>

    <!-- Reconnection Area (for disconnected devices) -->
    <div id="device-reconnect-${device.id}" class="hidden mt-3">
      <button 
        onclick="reconnectDevice('${device.id}')"
        class="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 text-sm">
        <i class="fa-solid fa-wifi mr-1"></i> Reconnect
      </button>
    </div>

    <!-- Pressure Data (shown when ready) -->
    <div id="device-data-${device.id}" class="hidden mt-3 bg-neutral-50 rounded-md p-2">
      <div class="text-xs text-neutral-500 mb-1">Live Pressure Reading</div>
      <div id="device-pressure-${device.id}" class="text-sm font-mono">-- PSI</div>
    </div>

    <!-- Certification Status (shown after verification) -->
    <div id="device-certification-${device.id}" class="hidden mt-3 p-2 rounded-md">
      <div class="text-xs text-neutral-500 mb-1">Certification Status</div>
      <div id="device-certification-status-${device.id}" class="text-sm font-medium mb-2">--</div>
      <button 
        id="device-download-pdf-${device.id}"
        onclick="downloadDevicePDF('${device.id}')"
        class="hidden w-full px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors duration-200 text-xs">
        <i class="fa-solid fa-download mr-1"></i> Download PDF
      </button>
    </div>
  `;

  return widget;
}

// Update device calibration status
function updateDeviceCalibrationStatus(deviceId, isCalibrating, message, hasError = false) {
  const widget = document.getElementById(`device-widget-${deviceId}`);
  const statusMessage = document.getElementById(`device-status-message-${deviceId}`);
  const disconnectBtn = widget?.querySelector('button[onclick*="disconnectDevice"]');
  const calibrationIndicator = document.getElementById(`device-calibration-indicator-${deviceId}`);

  if (!widget) return;

  // Update calibration indicator (create if doesn't exist)
  if (!calibrationIndicator) {
    const indicator = document.createElement('div');
    indicator.id = `device-calibration-indicator-${deviceId}`;
    indicator.className = 'calibration-status-indicator hidden';

    // Insert after device info section
    const deviceInfo = widget.querySelector('.text-xs.text-neutral-500.mb-2');
    if (deviceInfo) {
      deviceInfo.insertAdjacentElement('afterend', indicator);
    }
  }

  const indicator = document.getElementById(`device-calibration-indicator-${deviceId}`);

  if (isCalibrating) {
    // Show calibration in progress
    widget.classList.add('calibrating');
    widget.classList.remove('calibrated', 'not-calibrated');

    // Disable disconnect button during calibration
    if (disconnectBtn) {
      disconnectBtn.disabled = true;
      disconnectBtn.classList.add('opacity-50', 'cursor-not-allowed');
      disconnectBtn.title = 'Cannot remove device during calibration';
    }

    // Update status message
    if (statusMessage) {
      statusMessage.textContent = message || 'Calibration in progress...';
    }

    // Show calibration indicator
    if (indicator) {
      indicator.className = 'calibration-status-indicator bg-orange-100 border border-orange-300 rounded-md p-2 mt-2 flex items-center';
      indicator.innerHTML = `
        <div class="flex items-center w-full">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600 mr-2"></div>
          <span class="text-orange-700 text-xs font-medium">Calibrating...</span>
        </div>
      `;
    }

    // Update widget styling for calibration
    widget.className = 'rounded-md border border-orange-300 bg-orange-50 p-4 shadow-sm transition-all duration-200 calibrating';
  } else {
    // Calibration completed or not started
    widget.classList.remove('calibrating');

    // Re-enable disconnect button
    if (disconnectBtn) {
      disconnectBtn.disabled = false;
      disconnectBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      disconnectBtn.title = 'Disconnect and remove this kraken';
    }

    if (hasError) {
      // Show error state
      widget.classList.add('calibration-error');
      widget.classList.remove('calibrated', 'not-calibrated');

      // Update status message for error
      if (statusMessage) {
        statusMessage.textContent = message || 'Calibration failed';
      }

      // Show error indicator
      if (indicator) {
        indicator.className = 'calibration-status-indicator bg-red-100 border border-red-300 rounded-md p-2 mt-2 flex items-center';
        indicator.innerHTML = `
          <div class="flex items-center w-full">
            <i class="fa-solid fa-exclamation-triangle text-red-600 mr-2"></i>
            <span class="text-red-700 text-xs font-medium">Calibration Failed</span>
          </div>
        `;
      }

      // Update widget styling for error
      widget.className = 'rounded-md border border-red-300 bg-red-50 p-4 shadow-sm transition-all duration-200 calibration-error';
    } else {
      // Check if device was calibrated (based on message or current state)
      const wasCalibrated = message && message.includes('verification');

      if (wasCalibrated) {
        widget.classList.add('calibrated');
        widget.classList.remove('not-calibrated', 'calibration-error');

        // Show calibrated indicator
        if (indicator) {
          indicator.className = 'calibration-status-indicator bg-green-100 border border-green-300 rounded-md p-2 mt-2 flex items-center';
          indicator.innerHTML = `
            <div class="flex items-center w-full">
              <i class="fa-solid fa-check-circle text-green-600 mr-2"></i>
              <span class="text-green-700 text-xs font-medium">Calibrated - ${message}</span>
            </div>
          `;
        }

        // Update widget styling for calibrated
        widget.className = 'rounded-md border border-green-300 bg-green-50 p-4 shadow-sm transition-all duration-200 calibrated';
      } else {
        widget.classList.add('not-calibrated');
        widget.classList.remove('calibrated', 'calibration-error');

        // Show not calibrated indicator
        if (indicator) {
          indicator.className = 'calibration-status-indicator bg-gray-100 border border-gray-300 rounded-md p-2 mt-2 flex items-center';
          indicator.innerHTML = `
            <div class="flex items-center w-full">
              <i class="fa-solid fa-clock text-gray-600 mr-2"></i>
              <span class="text-gray-700 text-xs font-medium">Not Calibrated</span>
            </div>
          `;
        }

        // Update widget styling for not calibrated
        widget.className = 'rounded-md border border-gray-300 bg-white p-4 shadow-sm transition-all duration-200 not-calibrated';
      }
    }
  }
}

// Update device widget based on status (using old app style)
function updateDeviceWidget(deviceId, status, message, stage = null) {
  const statusMessage = document.getElementById(`device-status-message-${deviceId}`);
  const progressBar = document.getElementById(`device-progress-${deviceId}`);
  const actionArea = document.getElementById(`device-action-${deviceId}`);
  const dataArea = document.getElementById(`device-data-${deviceId}`);
  const widget = document.getElementById(`device-widget-${deviceId}`);

  if (!widget) return;

  // Update message
  if (statusMessage) {
    statusMessage.textContent = message || '';
  }

  // Update progress and styling based on status (like old app)
  if (progressBar && widget) {
    switch (status) {
      case 'pending':
        progressBar.style.width = '0%';
        progressBar.className = 'bg-neutral-800 h-2 rounded-full transition-all duration-500';
        widget.className = 'rounded-md border bg-white p-4 shadow-sm transition-all duration-200';
        break;
      case 'in-progress':
        {
          let progress = 25;
          if (stage === 'discovering') progress = 50;
          if (stage === 'subscribing') progress = 75;

          progressBar.style.width = `${progress}%`;
          progressBar.className = 'bg-blue-600 h-2 rounded-full transition-all duration-500';
          widget.className = 'rounded-md border border-blue-300 bg-blue-50 p-4 shadow-sm transition-all duration-200';
        }
        break;
      case 'ready':
        progressBar.style.width = '100%';
        progressBar.className = 'bg-green-600 h-2 rounded-full transition-all duration-500';
        widget.className = 'rounded-md border border-green-300 bg-green-50 p-4 shadow-sm transition-all duration-200';

        // Show data area for ready devices
        if (dataArea) {
          dataArea.classList.remove('hidden');
        }
        break;
      case 'verification-completed':
        progressBar.style.width = '100%';
        progressBar.className = 'bg-purple-600 h-2 rounded-full transition-all duration-500';
        widget.className = 'rounded-md border border-purple-300 bg-purple-50 p-4 shadow-sm transition-all duration-200';

        // Show data area for verification completed devices
        if (dataArea) {
          dataArea.classList.remove('hidden');
        }
        break;
      case 'failed':
        progressBar.style.width = '100%';
        progressBar.className = 'bg-red-600 h-2 rounded-full transition-all duration-500';
        widget.className = 'rounded-md border border-red-300 bg-red-50 p-4 shadow-sm transition-all duration-200';

        // Show retry button
        if (actionArea) {
          actionArea.classList.remove('hidden');
        }
        break;
    }
  }

  // Show/hide action areas based on status
  const reconnectArea = document.getElementById(`device-reconnect-${deviceId}`);

  if (actionArea && status !== 'failed') {
    actionArea.classList.add('hidden');
  }

  if (reconnectArea) {
    if (status === 'disconnected') {
      reconnectArea.classList.remove('hidden');
    } else {
      reconnectArea.classList.add('hidden');
    }
  }

  // Hide data area for non-ready states
  if (dataArea && status !== 'ready') {
    dataArea.classList.add('hidden');
  }

  // Update widget visual state for disconnected devices
  const deviceWidget = document.getElementById(`device-widget-${deviceId}`);
  if (deviceWidget) {
    if (status === 'disconnected') {
      deviceWidget.classList.add('border-red-300', 'bg-red-50');
      deviceWidget.classList.remove('border-green-300', 'bg-green-50');
    } else if (status === 'ready') {
      deviceWidget.classList.add('border-green-300', 'bg-green-50');
      deviceWidget.classList.remove('border-red-300', 'bg-red-50');
    } else {
      deviceWidget.classList.remove('border-red-300', 'bg-red-50', 'border-green-300', 'bg-green-50');
    }
  }
}

// Update kraken device details (firmware, display name, etc.)
function updateKrakenDetails(deviceId, firmwareVersion, displayName) {
  console.log(`Updating kraken ${deviceId} details: firmware=${firmwareVersion}, displayName=${displayName}`);

  // Update firmware version in widget
  const firmwareElement = document.querySelector(`#device-widget-${deviceId} .device-firmware`);
  if (firmwareElement && firmwareVersion) {
    firmwareElement.textContent = firmwareVersion;
  }

  // Update display name in widget header
  const nameElement = document.querySelector(`#device-widget-${deviceId} .device-name`);
  if (nameElement && displayName) {
    nameElement.textContent = `Sensor ${displayName}`;
  }

  // Store in connected devices map for future reference
  if (window.connectedDevices && window.connectedDevices.has(deviceId)) {
    const device = window.connectedDevices.get(deviceId);
    if (firmwareVersion) device.firmwareVersion = firmwareVersion;
    if (displayName) device.displayName = displayName;
    window.connectedDevices.set(deviceId, device);
  }
}

// Update device from detailed status object
function updateDeviceFromStatus(deviceId, statusObj) {
  const { status, stage, error } = statusObj;
  let message = '';

  switch (status) {
    case 'pending':
      if (stage === 'reconnecting') {
        message = 'Reconnecting to device...';
      } else {
        message = 'Waiting to start setup...';
      }
      break;
    case 'in-progress':
      if (stage === 'connecting') message = 'Reconnecting to device...';
      else if (stage === 'discovering') message = 'Discovering services...';
      else if (stage === 'reading-details') message = 'Reading device information...';
      else if (stage === 'subscribing') message = 'Setting up characteristics...';
      else if (stage === 'retrying') message = 'Retrying setup...';
      else if (stage === 'disconnecting') message = 'Disconnecting device...';
      else message = 'Setting up device...';
      break;
    case 'ready':
      message = 'Ready for calibration';
      break;
    case 'failed':
      message = error || 'Setup failed';
      break;
    case 'disconnected':
      message = 'Device disconnected - reconnect to continue';
      break;
  }

  updateDeviceWidget(deviceId, status, message, stage);
}

// Update progress summary
function updateProgressSummary(data) {
  const { ready, failed, progress } = data;

  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  // Update connection status
  const connectionStatus = document.getElementById('connection-status');
  if (connectionStatus) {
    if (progress === 100 && failed === 0) {
      connectionStatus.textContent = 'All devices ready';
    } else if (failed > 0) {
      connectionStatus.textContent = `${ready} ready, ${failed} failed`;
    } else {
      connectionStatus.textContent = `Setting up devices... ${progress}%`;
    }
  }
}

// Update device pressure data
function updateDevicePressureData(deviceId, pressure) {
  const pressureDisplay = document.getElementById(`device-pressure-${deviceId}`);
  if (pressureDisplay) {
    pressureDisplay.textContent = `${pressure.value.toFixed(2)} ${pressure.unit}`;
  }
}

// Handle device disconnection
function handleDeviceDisconnection(deviceId) {
  const widget = document.getElementById(`device-widget-${deviceId}`);
  if (widget) {
    widget.classList.add('opacity-50');
    updateDeviceWidget(deviceId, 'failed', 'Device disconnected');
  }

  connectedDevices.delete(deviceId);
  allDevicesReady = false;

  const startBtn = document.getElementById('start-calibration-btn');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }

  // Also disable verification button when device disconnects
  const verificationBtn = document.getElementById('start-verification-btn');
  if (verificationBtn && !verificationBtn.classList.contains('hidden')) {
    verificationBtn.disabled = true;
    verificationBtn.classList.add('opacity-50', 'cursor-not-allowed');
    verificationBtn.title = 'Cannot start verification - device disconnected';
  }
}

// Retry device setup (called from retry button)
async function retryDeviceSetup(deviceId) {
  try {
    const result = await window.electronAPI.krakenCalibrationRetryDevice(deviceId);
    if (!result.success) {
      NotificationHelper.showError(`Failed to retry device setup: ${result.error}`);
    }
  } catch (error) {
    NotificationHelper.showError(`Error retrying device setup: ${error.message}`);
  }
}

// Reconnect a disconnected device
async function reconnectDevice(deviceId) {
  try {
    console.log(`Reconnecting device ${deviceId}...`);
    const result = await window.electronAPI.krakenCalibrationReconnectDevice(deviceId);

    if (!result.success) {
      alert(`Failed to reconnect device: ${result.error}`);
    }
  } catch (error) {
    console.error('Error reconnecting device:', error);
    alert(`Error reconnecting device: ${error.message}`);
  }
}

// Manually disconnect a device
async function disconnectDevice(deviceId) {
  try {
    const confirmDisconnect = confirm('Are you sure you want to disconnect and remove this kraken from the calibration?');
    if (!confirmDisconnect) return;

    console.log(`Manually disconnecting device ${deviceId}...`);

    // Immediately disable widget and show removing state
    const widget = document.getElementById(`device-widget-${deviceId}`);
    const disconnectBtn = document.querySelector(`[onclick="disconnectDevice('${deviceId}')"]`);

    if (widget) {
      widget.style.pointerEvents = 'none';
      widget.style.opacity = '0.7';
      widget.classList.add('removing');
    }

    if (disconnectBtn) {
      disconnectBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-sm"></i>';
      disconnectBtn.disabled = true;
    }

    // Update widget status immediately
    updateDeviceWidget(deviceId, 'in-progress', 'Preparing to remove...');

    const result = await window.electronAPI.krakenCalibrationDisconnectDevice(deviceId);

    if (!result.success) {
      NotificationHelper.showError(`Failed to remove kraken: ${result.error}`);

      // Reset widget state on failure
      if (widget) {
        widget.style.pointerEvents = 'auto';
        widget.style.opacity = '1';
        widget.classList.remove('removing');
      }

      if (disconnectBtn) {
        disconnectBtn.innerHTML = '<i class="fa-solid fa-times text-sm"></i>';
        disconnectBtn.disabled = false;
      }
    }
  } catch (error) {
    console.error('Error disconnecting device:', error);
    NotificationHelper.showError(`Error removing kraken: ${error.message}`);

    // Reset widget state on error
    const widget = document.getElementById(`device-widget-${deviceId}`);
    const disconnectBtn = document.querySelector(`[onclick="disconnectDevice('${deviceId}')"]`);

    if (widget) {
      widget.style.pointerEvents = 'auto';
      widget.style.opacity = '1';
      widget.classList.remove('removing');
    }

    if (disconnectBtn) {
      disconnectBtn.innerHTML = '<i class="fa-solid fa-times text-sm"></i>';
      disconnectBtn.disabled = false;
    }
  }
}

function populateCalibrationControls() {
  // Sweep value is now hardcoded to 300 PSI, no need to populate dropdown

  // Populate Tester Name dropdown
  populateSelectOptions('tester-name', KRAKEN_CONSTANTS.TESTER_NAMES);
}

// Make functions globally available for onclick handlers
window.retryDeviceSetup = retryDeviceSetup;
window.reconnectDevice = reconnectDevice;
window.disconnectDevice = disconnectDevice;

/**
 * Show verification results container and initialize it for new verification
 */
function initializeVerificationResults() {
  const resultsContainer = document.getElementById('verification-results-container');
  const resultsTableWrapper = document.getElementById('results-table-wrapper');
  // const removeButton = document.getElementById('remove-verification-button');

  if (resultsContainer && resultsTableWrapper) {
    // Show the container
    resultsContainer.classList.remove('hidden');

    // Initialize with loading message
    resultsTableWrapper.innerHTML = '<p class="text-gray-500 text-center py-4">Starting verification sweep... Data will appear here as readings are captured.</p>';

    // Disable remove button during verification
    // removeButton.disabled = true;
  }
}

function displayVerificationResults(data) {
  console.log('Displaying verification results:', data);

  const resultsContainer = document.getElementById('verification-results-container');
  const resultsTableWrapper = document.getElementById('results-table-wrapper');
  // const removeButton = document.getElementById('remove-verification-button');

  if (!resultsContainer || !resultsTableWrapper) {
    console.error('Verification results container or elements not found.');
    return;
  }

  if (!data || Object.keys(data).length === 0) {
    resultsTableWrapper.innerHTML = '<p class="text-gray-500 text-center py-4">No verification data available yet. Data will appear here as the verification sweep progresses.</p>';
    resultsContainer.classList.remove('hidden');
    // removeButton.disabled = false;
    return;
  }

  // Add minimal completion status (only if not already present)
  let completionHeader = resultsContainer.querySelector('.verification-completion-header');
  if (!completionHeader) {
    completionHeader = document.createElement('div');
    completionHeader.className = 'verification-completion-header mb-2 p-2 bg-green-50 border border-green-200 rounded text-center';
    completionHeader.innerHTML = `
      <span class="text-sm text-green-700">✅ Verification completed</span>
    `;

    // Insert completion header at the top of results container
    resultsContainer.insertBefore(completionHeader, resultsContainer.firstChild);
  }

  // Get all unique pressure points and sort them
  const allPressurePoints = new Set();
  Object.values(data).forEach(deviceData => {
    if (Array.isArray(deviceData)) {
      deviceData.forEach(reading => {
        if (reading.flukePressure !== undefined) {
          allPressurePoints.add(reading.flukePressure);
        }
      });
    }
  });

  const sortedPressurePoints = Array.from(allPressurePoints).sort((a, b) => a - b);

  // Get device names for headers
  const deviceIds = Object.keys(data);
  const deviceNames = deviceIds.map(deviceId => {
    const widget = document.getElementById(`device-widget-${deviceId}`);
    return widget ? widget.querySelector('h4').textContent.replace('Sensor ', '') : 'Unknown Device';
  });

  let table = '<table class="min-w-full divide-y divide-gray-200 border border-gray-300">';

  // Create header with device names
  table += '<thead class="bg-gray-50">';
  table += '<tr>';
  table += '<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">Reference (PSI)</th>';

  // Add columns for each device (Value and Discrepancy)
  deviceNames.forEach(deviceName => {
    table += `<th colspan="2" class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">${deviceName}</th>`;
  });
  table += '</tr>';

  // Sub-header row for Value and Discrepancy
  table += '<tr>';
  table += '<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300"></th>';
  deviceNames.forEach(() => {
    table += '<th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">Value</th>';
    table += '<th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">Discrepancy</th>';
  });
  table += '</tr>';
  table += '</thead>';

  // Table body
  table += '<tbody class="bg-white divide-y divide-gray-200">';

  sortedPressurePoints.forEach(pressurePoint => {
    table += '<tr>';
    table += `<td class="px-4 py-3 whitespace-nowrap font-medium text-gray-900 border border-gray-300">${pressurePoint.toFixed(1)}</td>`;

    // Add data for each device at this pressure point
    deviceIds.forEach(deviceId => {
      const deviceData = data[deviceId];
      if (Array.isArray(deviceData)) {
        const reading = deviceData.find(r => r.flukePressure === pressurePoint);
        if (reading && reading.krakenPressure !== undefined) {
          const discrepancy = (reading.krakenPressure - reading.flukePressure).toFixed(1);
          const discrepancyClass = Math.abs(reading.krakenPressure - reading.flukePressure) > 1 ? 'text-red-600' : 'text-green-600';

          table += `<td class="px-4 py-3 whitespace-nowrap text-gray-900 border border-gray-300">${reading.krakenPressure.toFixed(1)}</td>`;
          table += `<td class="px-4 py-3 whitespace-nowrap ${discrepancyClass} border border-gray-300">${discrepancy}</td>`;
        } else {
          table += '<td class="px-4 py-3 whitespace-nowrap text-gray-400 border border-gray-300">--</td>';
          table += '<td class="px-4 py-3 whitespace-nowrap text-gray-400 border border-gray-300">--</td>';
        }
      } else {
        table += '<td class="px-4 py-3 whitespace-nowrap text-gray-400 border border-gray-300">--</td>';
        table += '<td class="px-4 py-3 whitespace-nowrap text-gray-400 border border-gray-300">--</td>';
      }
    });

    table += '</tr>';
  });

  table += '</tbody></table>';

  resultsTableWrapper.innerHTML = table;
  console.log('Verification results table updated successfully');

  resultsContainer.classList.remove('hidden');
  // removeButton.disabled = false; // Commented out as removeButton is not defined
}

/**
 * Update verification results table in real-time as new data comes in
 * @param {Object} data - Real-time update data
 */
function updateVerificationResultsRealtime(data) {
  console.log('Real-time verification update received:', data);

  const { deviceId, flukePressure, krakenPressure, currentSweepData } = data;

  // Always show the verification results container during verification
  const resultsContainer = document.getElementById('verification-results-container');
  if (resultsContainer) {
    resultsContainer.classList.remove('hidden');
  }

  // Update the table with the new data
  if (currentSweepData && Object.keys(currentSweepData).length > 0) {
    console.log('Updating verification table with current sweep data:', currentSweepData);
    displayVerificationResults(currentSweepData);

    // Show a temporary highlight for the new reading
    highlightNewReading(deviceId, flukePressure);
  } else {
    console.warn('No current sweep data available for real-time update');
  }
}

/**
 * Highlight a new reading in the verification table
 * @param {string} deviceId - Device ID
 * @param {number} flukePressure - Fluke pressure
 * @param {number} krakenPressure - Kraken pressure reading
 */
function highlightNewReading(deviceId, flukePressure) {
  // Find the row in the table for this device and pressure point
  const table = document.querySelector('#results-table-wrapper table');
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');
  const targetRow = Array.from(rows).find(row => {
    const pressureCell = row.querySelector('td:first-child');
    const deviceNameCell = row.querySelector('td:nth-child(2)');
    return pressureCell && deviceNameCell && parseFloat(pressureCell.textContent) === flukePressure && deviceNameCell.textContent.includes(deviceId.substring(0, 8));
  });

  if (targetRow) {
    // Add highlight effect to the entire row
    targetRow.style.backgroundColor = '#fef3c7';
    targetRow.style.transition = 'background-color 0.5s ease';

    // Remove highlight after 2 seconds
    setTimeout(() => {
      targetRow.style.backgroundColor = '';
    }, 2000);
  }
}

/**
 * Update verification progress display
 * @param {Object} data - Progress update data
 */
function updateKrakenCalibrationReferencePressure(pressure) {
  const referencePressureElement = document.getElementById('reference-pressure-value');
  if (referencePressureElement) {
    referencePressureElement.textContent = `${pressure.toFixed(2)} PSI`;
  }
}

function updateKrakenPressure(data) {
  const { deviceId, deviceName, pressure } = data;
  const sensorPressuresContainer = document.getElementById('sensor-pressures');

  if (sensorPressuresContainer) {
    // Find existing pressure element for this device
    let pressureElement = document.getElementById(`sensor-pressure-${deviceId}`);

    if (!pressureElement) {
      // Create new pressure element if it doesn't exist
      pressureElement = document.createElement('div');
      pressureElement.id = `sensor-pressure-${deviceId}`;
      pressureElement.className = 'flex justify-between rounded-md bg-neutral-50 p-3';
      sensorPressuresContainer.appendChild(pressureElement);
    }

    // Update the pressure display
    pressureElement.innerHTML = `
      <span>${deviceName}</span>
      <span>${pressure.toFixed(2)} PSI</span>
    `;
  }
}

// Download device PDF function - used in onclick attributes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function downloadDevicePDF(deviceId) {
  try {
    const result = await window.electronAPI.krakenCalibrationDownloadPDF(deviceId);
    if (result.success) {
      NotificationHelper.showSuccess(`PDF downloaded successfully to Downloads folder: ${result.filename}`);
    } else {
      NotificationHelper.showError(`Failed to download PDF: ${result.error}`);
    }
  } catch (error) {
    console.error('Error downloading PDF:', error);
    NotificationHelper.showError('Failed to download PDF. Please try again.');
  }
}

// Update device certification status
function updateDeviceCertificationStatus(deviceId, certificationResult) {
  const certificationDiv = document.getElementById(`device-certification-${deviceId}`);
  const statusDiv = document.getElementById(`device-certification-status-${deviceId}`);
  const downloadBtn = document.getElementById(`device-download-pdf-${deviceId}`);

  if (!certificationDiv || !statusDiv || !downloadBtn) return;

  // Show certification section
  certificationDiv.classList.remove('hidden');

  // Update status display with detailed information
  if (certificationResult.certified) {
    statusDiv.innerHTML = `
      <div class="text-green-600 font-bold text-base mb-1">✅ CERTIFICATION PASSED</div>
      <div class="text-sm text-green-700">Average Discrepancy: ${certificationResult.averageDiscrepancy} PSI</div>
      <div class="text-xs text-green-600">Criteria: ≤ 1.5 PSI</div>
    `;
    statusDiv.className = 'text-sm font-medium mb-2';
    certificationDiv.className = 'mt-3 p-3 rounded-md bg-green-50 border border-green-200';
  } else {
    statusDiv.innerHTML = `
      <div class="text-red-600 font-bold text-base mb-1">❌ CERTIFICATION FAILED</div>
      <div class="text-sm text-red-700">Average Discrepancy: ${certificationResult.averageDiscrepancy} PSI</div>
      <div class="text-xs text-red-600">Criteria: ≤ 1.5 PSI</div>
    `;
    statusDiv.className = 'text-sm font-medium mb-2';
    certificationDiv.className = 'mt-3 p-3 rounded-md bg-red-50 border border-red-200';
  }

  // Show download button
  downloadBtn.classList.remove('hidden');

  // Update device widget status to show verification completed with certification result
  const statusText = certificationResult.certified ? 'Verification completed - Certified' : 'Verification completed - Failed';
  updateDeviceWidget(deviceId, 'verification-completed', statusText);
}
