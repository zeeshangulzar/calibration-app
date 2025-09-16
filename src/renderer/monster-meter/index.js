/**
 * Monster Meter Renderer - Matches previous app exactly
 */
import * as NotificationHelper from '../../shared/helpers/notification-helper.js';
import { MONSTER_METER_CONSTANTS } from '../../config/constants/monster-meter.constants.js';

const getLocalTimestamp = () => new Date().toLocaleTimeString();

// State management
let eventListenersSetup = false;
let isCalibrationActive = false;
let isVerificationActive = false;
let isMonsterMeterConnected = false;
let isCalibrationCompleted = false; // Track if calibration completed successfully

// Element references
const elements = {
  get backBtn() {
    return document.getElementById('back-button-monster-meter-calibration');
  },
  get portSelect() {
    return document.getElementById('portSelect');
  },
  get refreshPortsButton() {
    return document.getElementById('refresh-ports-button');
  },
  get connectPortButton() {
    return document.getElementById('connect-monster-meter-port-button');
  },
  get errorOkBtn() {
    return document.getElementById('error-ok-btn');
  },
  get errorAlert() {
    return document.getElementById('error-alert');
  },
  get startCalibrationBtn() {
    return document.getElementById('start-calibration-btn');
  },
  get stopCalibrationBtn() {
    return document.getElementById('stop-calibration-btn');
  },
  get startVerificationBtn() {
    return document.getElementById('start-verification-btn');
  },
  get stopVerificationBtn() {
    return document.getElementById('stop-verification-btn');
  },
  get testerNameSelect() {
    return document.getElementById('tester-name');
  },
  get modelSelect() {
    return document.getElementById('model-select');
  },
  get serialNumberInput() {
    return document.getElementById('serial-number');
  },
  get logContainer() {
    return document.getElementById('monster-meter-log-messages');
  },
  get scrollContainer() {
    return document.getElementById('monster-meter-calibration-log-content');
  },
  get sensorSelection() {
    return document.getElementById('monster-meter-selection');
  },
};

// Event handler utilities
const setButtonState = (button, disabled, text, className = '') => {
  if (!button) return;
  button.disabled = disabled;
  if (text) button.textContent = text;
  if (disabled) {
    button.classList.add('opacity-50', 'cursor-not-allowed');
  } else {
    button.classList.remove('opacity-50', 'cursor-not-allowed');
  }
  if (className) button.className = className;
};

const updateBackButton = () => {
  const { backBtn } = elements;
  if (!backBtn) return;

  // Disable back button when calibration or verification is active
  const shouldDisable = isCalibrationActive || isVerificationActive;
  setButtonState(backBtn, shouldDisable);

  // Show/hide status message
  const statusMessage = document.getElementById('back-button-status-message');
  const messageText = document.getElementById('back-button-message-text');

  if (statusMessage && messageText) {
    if (shouldDisable) {
      let message = '';
      if (isCalibrationActive) {
        message = 'Back button is disabled during calibration. It will be re-enabled when calibration completes or if an error occurs.';
      } else if (isVerificationActive) {
        message = 'Back button is disabled during verification. It will be re-enabled when verification completes or if an error occurs.';
      }

      messageText.textContent = message;
      statusMessage.classList.remove('hidden');
    } else {
      statusMessage.classList.add('hidden');
    }
  }
};

const updateConnectButton = () => {
  const { portSelect, connectPortButton } = elements;
  if (portSelect && connectPortButton) {
    setButtonState(connectPortButton, !portSelect.value);
  }
  // Also update calibration buttons when connection status changes
  updateCalibrationButtons();
};

// Main event handlers
const handleConnectPort = async () => {
  const { portSelect, connectPortButton, refreshPortsButton } = elements;
  const selectedPort = portSelect?.value;

  if (!selectedPort) {
    NotificationHelper.showCustomAlertModal('Please select a port first to connect.');
    return;
  }

  try {
    // Disable connect button, refresh button, and port dropdown during connection
    setButtonState(connectPortButton, true, 'Connecting...');
    setButtonState(refreshPortsButton, true);
    if (portSelect) {
      portSelect.disabled = true;
      portSelect.classList.add('opacity-50', 'cursor-not-allowed');
    }
    addLogMessage(`Attempting to connect to ${selectedPort}...`);

    const result = await window.electronAPI.monsterMeterConnectPort(selectedPort);

    if (result.success) {
      addLogMessage(`Successfully connected to ${selectedPort}`);
      // Keep port dropdown disabled after successful connection
      // Don't re-enable it in the finally block
    } else {
      addLogMessage(`Failed to connect: ${result.error}`, 'error');
      NotificationHelper.showError(`Connection failed: ${result.error}`);
      // Re-enable port dropdown only if connection failed
      if (portSelect) {
        portSelect.disabled = false;
        portSelect.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }
  } catch (error) {
    addLogMessage(`Connection error: ${error.message}`, 'error');
    NotificationHelper.showError(`Connection error: ${error.message}`);
    // Re-enable port dropdown only if connection failed
    if (portSelect) {
      portSelect.disabled = false;
      portSelect.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  } finally {
    // Re-enable buttons after connection attempt (but not port dropdown if successful)
    setButtonState(connectPortButton, true);
    setButtonState(refreshPortsButton, true);
    if (connectPortButton) {
      connectPortButton.innerHTML = '<i class="fa-solid fa-upload mr-2"></i> Connect';
    }
  }
};

const cleanupMonsterMeterModule = async () => {
  try {
    console.log('Cleaning up Monster Meter module...');
    cleanupEventListeners();

    // Re-enable port dropdown when cleaning up
    const { portSelect, connectPortButton, refreshPortsButton } = elements;
    if (portSelect) {
      portSelect.disabled = false;
      portSelect.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    if (refreshPortsButton) {
      refreshPortsButton.disabled = false;
      refreshPortsButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    if (connectPortButton) {
      connectPortButton.disabled = false;
    }

    if (window.electronAPI.monsterMeterCleanupModule) {
      await window.electronAPI.monsterMeterCleanupModule();
    }

    console.log('Monster Meter module cleanup completed');
  } catch (error) {
    console.error('Error cleaning up Monster Meter module:', error);
  }
};

// DOM event setup
document.addEventListener('DOMContentLoaded', () => {
  const {
    backBtn,
    portSelect,
    refreshPortsButton,
    connectPortButton,
    errorOkBtn,
    errorAlert,
    startCalibrationBtn,
    stopCalibrationBtn,
    startVerificationBtn,
    stopVerificationBtn,
    testerNameSelect,
    modelSelect,
    serialNumberInput,
  } = elements;

  // Event listeners
  errorOkBtn?.addEventListener('click', () => errorAlert?.classList.add('hidden'));
  backBtn?.addEventListener('click', async () => {
    await cleanupMonsterMeterModule();
    window.electronAPI.monsterMeterGoBack();
  });
  refreshPortsButton?.addEventListener('click', () => window.electronAPI.monsterMeterRefreshPorts());
  portSelect?.addEventListener('change', updateConnectButton);
  connectPortButton?.addEventListener('click', handleConnectPort);

  // Calibration event listeners
  startCalibrationBtn?.addEventListener('click', handleStartCalibration);
  stopCalibrationBtn?.addEventListener('click', handleStopCalibration);

  // Verification event listeners
  startVerificationBtn?.addEventListener('click', handleStartVerification);
  stopVerificationBtn?.addEventListener('click', handleStopVerification);
  testerNameSelect?.addEventListener('change', updateCalibrationButtons);
  modelSelect?.addEventListener('change', updateCalibrationButtons);
  serialNumberInput?.addEventListener('input', updateCalibrationButtons);

  // Tab switching
  document.getElementById('monster-meter-tab-calibration')?.addEventListener('click', () => switchTab('calibration'));
  document.getElementById('monster-meter-tab-verification')?.addEventListener('click', () => switchTab('verification'));

  // Initial button state
  updateConnectButton();
  updateCalibrationButtons();
  updateBackButton();
});

// IPC Event Listeners
const ipcHandlers = {
  onMonsterMeterPortsUpdated: ports => {
    const { portSelect } = elements;
    if (!portSelect) return;

    setTimeout(() => {
      portSelect.innerHTML = '<option value="">Select Port</option>';
      ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.textContent = `${port.path} - ${port.manufacturer || 'Unknown'}`;
        portSelect.appendChild(option);
      });

      updateConnectButton();
    }, MONSTER_METER_CONSTANTS.UI_UPDATE_DELAY);
  },

  onMonsterMeterConnected: data => {
    isMonsterMeterConnected = true;
    addLogMessage('Monster Meter connected successfully');
    NotificationHelper.showSuccess('Monster Meter connected successfully');
    updateCalibrationButtons();
  },

  onMonsterMeterDataUpdated: data => {
    showMonsterMeterWidget(data);
    updateLiveData(data.data);
  },

  onMonsterMeterDisconnected: () => {
    isMonsterMeterConnected = false;
    hideMonsterMeterWidget();
    addLogMessage('Monster Meter disconnected');
    NotificationHelper.showInfo('Monster Meter disconnected');
    updateCalibrationButtons();

    // Re-enable port dropdown when disconnected
    const { portSelect, connectPortButton, refreshPortsButton } = elements;
    if (portSelect) {
      portSelect.disabled = false;
      portSelect.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    if (connectPortButton) {
      connectPortButton.disabled = false;
      connectPortButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    if (refreshPortsButton) {
      refreshPortsButton.disabled = false;
      refreshPortsButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    const statusEl = document.getElementById('portStatus');
    if (statusEl) {
      statusEl.textContent = 'Closed';
      statusEl.className = 'px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs';
    }
  },

  onMonsterMeterConnectionError: data => {
    isMonsterMeterConnected = false;
    addLogMessage(`Connection error: ${data.error}`, 'error');
    NotificationHelper.showError(`Failed to connect to ${data.port}: ${data.error}`);
    updateCalibrationButtons();

    // Re-enable port dropdown on connection error
    const { portSelect } = elements;
    if (portSelect) {
      portSelect.disabled = false;
      portSelect.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  },

  onMonsterMeterError: data => {
    addLogMessage(`Error: ${data.message}`, 'error');
    NotificationHelper.showError(data.message);
  },

  // Calibration event handlers
  onMonsterMeterLog: message => {
    addLogMessage(message);
  },

  onMonsterMeterCalibrationStarted: data => {
    isCalibrationActive = true;
    updateCalibrationButtons();
    updateBackButton();
    // Clear previous calibration data when starting new calibration
    clearCalibrationData();
    showCalibrationResultsSection();
    addLogMessage('🚀 Calibration started');
    NotificationHelper.showSuccess('Calibration started successfully!');
  },

  onMonsterMeterCalibrationStopped: data => {
    isCalibrationActive = false;
    updateCalibrationButtons();
    updateBackButton();
    addLogMessage(`🛑 Calibration stopped: ${data.reason}`);
    NotificationHelper.showInfo(`Calibration stopped: ${data.reason}`);
    // Keep calibration table visible - don't clear data when stopping
  },

  onMonsterMeterCalibrationFailed: data => {
    isCalibrationActive = false;
    updateCalibrationButtons();
    updateBackButton();
    addLogMessage(`❌ Calibration failed: ${data.error}`, 'error');
    NotificationHelper.showError(`Calibration failed: ${data.error}`);
  },

  onMonsterMeterCalibrationCompleted: data => {
    isCalibrationActive = false;
    isCalibrationCompleted = true; // Mark calibration as completed
    updateCalibrationButtons();
    updateBackButton();
    addLogMessage('✅ Calibration completed successfully!');
    NotificationHelper.showSuccess('Calibration completed successfully!');
    showCalibrationResults(data);
  },

  onMonsterMeterCalibrationData: data => {
    updateCalibrationProgress(data);
    updateCalibrationResultsTable(data);
  },

  // Live sensor data updates during calibration
  onMonsterMeterLiveData: data => {
    updateLiveSensorData(data);
  },

  // Verification event handlers
  onMonsterMeterVerificationStarted: data => {
    isVerificationActive = true;
    isCalibrationCompleted = false; // Reset when verification starts
    updateCalibrationButtons();
    updateBackButton();
    showVerificationResultsSection();
    // Don't clear calibration data - keep it visible
    NotificationHelper.showSuccess('Verification started successfully!');
  },

  onMonsterMeterVerificationStopped: data => {
    isVerificationActive = false;
    updateCalibrationButtons();
    updateBackButton();
    NotificationHelper.showInfo(`Verification stopped: ${data.reason}`);
  },

  onMonsterMeterVerificationFailed: data => {
    isVerificationActive = false;
    updateCalibrationButtons();
    updateBackButton();
    NotificationHelper.showError(`Verification failed: ${data.error}`);
  },

  onMonsterMeterVerificationCompleted: data => {
    isVerificationActive = false;
    isCalibrationCompleted = true; // Mark as completed after verification
    updateCalibrationButtons();
    updateBackButton();
    enableVerificationTab();
    hideStartVerificationButton(); // Hide start verification button
    NotificationHelper.showSuccess('Verification completed successfully!');
    showVerificationResults(data);
  },

  onMonsterMeterVerificationData: data => {
    updateVerificationProgress(data);
    updateVerificationResultsTable(data.verificationData || []);
    // Add log message for each verification point
    if (data.verificationData && data.verificationData.length > 0) {
      const latestPoint = data.verificationData[data.verificationData.length - 1];
      const status = latestPoint.inRange ? 'PASS' : 'FAIL';
      const statusIcon = latestPoint.inRange ? '✅' : '❌';
      addLogMessage(`${statusIcon} Verification Point ${data.verificationData.length}: ${latestPoint.referencePressure.toFixed(1)} PSI - ${status}`);
    }
  },

  onMonsterMeterPDFGenerated: data => {
    showViewPDFButton(data.filePath, data.filename);
    addLogMessage(`📄 PDF report generated: ${data.filename}`);
  },
};

function setupEventListeners() {
  if (eventListenersSetup) return;

  Object.entries(ipcHandlers).forEach(([event, handler]) => {
    window.electronAPI[event]?.(handler);
  });

  // DOM event listeners
  elements.backBtn?.addEventListener('click', () => {
    window.electronAPI.navigateToHome();
  });

  elements.refreshPortsBtn?.addEventListener('click', () => {
    window.electronAPI.refreshMonsterMeterPorts();
  });

  elements.connectBtn?.addEventListener('click', () => {
    const selectedPort = elements.portSelect?.value;
    if (selectedPort) {
      window.electronAPI.connectToMonsterMeterPort(selectedPort);
    }
  });

  // Tester name, model, and serial number change handlers
  elements.testerNameSelect?.addEventListener('change', updateCalibrationButtons);
  elements.modelSelect?.addEventListener('change', updateCalibrationButtons);
  elements.serialNumberInput?.addEventListener('input', updateCalibrationButtons);

  // Tab switching
  document.getElementById('monster-meter-tab-calibration')?.addEventListener('click', () => switchTab('calibration'));
  document.getElementById('monster-meter-tab-verification')?.addEventListener('click', () => switchTab('verification'));

  eventListenersSetup = true;
}

function cleanupEventListeners() {
  if (window.electronAPI.removeAllMonsterMeterListeners) {
    window.electronAPI.removeAllMonsterMeterListeners();
  }
  eventListenersSetup = false;
}

function populateTesterNames() {
  const testerSelect = elements.testerNameSelect;
  if (!testerSelect) return;

  // Clear existing options except the first one
  testerSelect.innerHTML = '<option value="">Select Tester Name</option>';

  // Add tester names from constants
  Object.entries(MONSTER_METER_CONSTANTS.TESTER_NAMES).forEach(([key, value]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    testerSelect.appendChild(option);
  });
}

function populateModelOptions() {
  const modelSelect = elements.modelSelect;
  if (!modelSelect) return;

  // Clear existing options except the first one
  modelSelect.innerHTML = '<option value="">Select Model</option>';

  // Add model options from constants
  Object.entries(MONSTER_METER_CONSTANTS.MODEL_OPTIONS).forEach(([key, value]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    modelSelect.appendChild(option);
  });
}

// Widget management
function showMonsterMeterWidget(deviceInfo) {
  const { sensorSelection } = elements;
  if (!sensorSelection) return;

  sensorSelection.classList.remove('hidden');
  const grid = sensorSelection.querySelector('.grid');
  grid.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'rounded-lg border bg-white p-4 shadow-sm';
  card.id = 'monster-meter-widget';

  const deviceName = deviceInfo.name || deviceInfo.swVersion || 'N/A';

  card.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="w-full">
        <h3>Monster Meter</h3>
        <div class="flex items-center gap-2">
          <p class="text-sm text-neutral-600 font-bold">Name:</p>
          <p class="text-sm text-neutral-600"><span id="nameText">${deviceName}</span></p>
        </div>
        <div class="flex items-center gap-2">
          <p class="text-sm text-neutral-600 font-bold">Port:</p>
          <p class="text-sm text-neutral-600">${deviceInfo.port || 'Unknown'}</p>
        </div>
        <p>
          <span id="portStatus" class="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs">Opened</span>
        </p>
        <div id="pdf-button-container" class="mt-2 inline-flex w-full"></div>
      </div>
    </div>
  `;

  grid.appendChild(card);
  // addLogMessage(`Monster Meter widget displayed: ${deviceName}`);
}

function hideMonsterMeterWidget() {
  const { sensorSelection } = elements;
  if (sensorSelection) {
    sensorSelection.classList.add('hidden');
    const grid = sensorSelection.querySelector('.grid');
    if (grid) grid.innerHTML = '';
  }
  resetLiveDataDisplays();
}

// Data display management
function updateLiveData(data) {
  if (!data) return;

  const dataElements = {
    'live-monster-meter-sensorhi-voltage-value': { value: data['SensorHi.vAVG'], type: 'voltage' },
    'live-monster-meter-sensorhi-pressure-value': { value: data['SensorHi.psiAVG'], type: 'pressure' },
    'live-monster-meter-sensorlo-voltage-value': { value: data['SensorLo.vAVG'], type: 'voltage' },
    'live-monster-meter-sensorlo-pressure-value': { value: data['SensorLo.psiAVG'], type: 'pressure' },
  };

  Object.entries(dataElements).forEach(([id, { value, type }]) => {
    const element = document.getElementById(id);
    if (element && value !== undefined) {
      element.textContent = type === 'voltage' ? parseFloat(value).toFixed(6) : `${parseFloat(value).toFixed(3)} PSI`;
    }
  });
}

function resetLiveDataDisplays() {
  const elementIds = [
    'live-monster-meter-sensorhi-voltage-value',
    'live-monster-meter-sensorhi-pressure-value',
    'live-monster-meter-sensorlo-voltage-value',
    'live-monster-meter-sensorlo-pressure-value',
    'monster-meter-reference-pressure-value',
  ];

  elementIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.textContent = 'N/A';
  });
}

// Logging
function addLogMessage(message, type = 'info') {
  const { logContainer, scrollContainer } = elements;
  if (!logContainer) return;

  const newLog = document.createElement('p');
  newLog.className = 'font-mono';

  const typeClasses = {
    error: 'text-red-400',
    warning: 'text-yellow-400',
    success: 'text-green-400',
  };

  if (typeClasses[type]) {
    newLog.classList.add(typeClasses[type]);
  }

  newLog.textContent = `[${getLocalTimestamp()}] ${message}`;
  logContainer.appendChild(newLog);

  if (scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }
}

// Verification table management functions
function showVerificationResults(data) {
  // Show verification results section
  const resultsSection = document.getElementById('monster-meter-calibration-results');
  if (resultsSection) {
    resultsSection.classList.remove('hidden');
  }

  // Switch to verification tab
  switchTab('verification');

  // Update verification results with data
  if (data && data.verificationData) {
    console.log('Verification completed with data:', data.verificationData);
    console.log('Verification summary:', data.summary);
    updateVerificationResultsTable(data.verificationData);
    showVerificationSummary(data.summary);
  }
}

function updateVerificationResultsTable(data) {
  const tbody = document.getElementById('verification-results-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (data && data.length > 0) {
    data.forEach((point, index) => {
      const row = document.createElement('tr');
      row.classList.add('border-b');
      const statusClass = point.inRange ? 'text-green-600' : 'text-red-600';
      const statusText = point.inRange ? 'PASS' : 'FAIL';
      const statusIcon = point.inRange ? '✓' : '✗';

      row.innerHTML = `
        <td class="py-2 pr-6">${index + 1}</td>
        <td class="py-2 pr-6">${point.referencePressure.toFixed(1)}</td>
        <td class="py-2 pr-6">${point.voltageHi.toFixed(7)}</td>
        <td class="py-2 pr-6">${point.pressureHi.toFixed(1)}</td>
        <td class="py-2 pr-6">${point.voltageLo.toFixed(7)}</td>
        <td class="py-2 pr-6">${point.pressureLo.toFixed(1)}</td>
        <td class="py-2 pr-6 font-semibold ${statusClass}">
          <span class="inline-flex items-center">
            <span class="mr-1">${statusIcon}</span>
            ${statusText}
          </span>
        </td>
      `;
      tbody.appendChild(row);
    });
  }
}

function updateVerificationProgress(data) {
  const progressText = document.getElementById('verification-progress-text');
  if (progressText && data) {
    const completed = data.completed || 0;
    const total = data.total || 0;
    progressText.textContent = `Progress: ${completed}/${total} points completed`;
  }
}

function showVerificationSummary(summary) {
  const summaryDiv = document.getElementById('verification-summary');
  if (!summaryDiv || !summary) return;

  const statusClass = summary.status === 'PASSED' ? 'text-green-600' : 'text-red-600';
  const statusIcon = summary.status === 'PASSED' ? '✓' : '✗';
  const bgClass = summary.status === 'PASSED' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';

  summaryDiv.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h4 class="text-lg font-semibold text-gray-800">Verification Summary</h4>
      <div class="flex items-center ${statusClass} font-semibold">
        <span class="mr-2 text-xl">${statusIcon}</span>
        ${summary.status}
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4 text-sm">
      <div class="flex justify-between">
        <span class="text-gray-600">Total Points:</span>
        <span class="font-semibold text-gray-900">${summary.totalPoints}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-600">Passed:</span>
        <span class="font-semibold text-green-600">${summary.passedPoints}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-600">Failed:</span>
        <span class="font-semibold text-red-600">${summary.failedPoints}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-600">Pass Rate:</span>
        <span class="font-semibold text-gray-900">${summary.passRate}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-600">Tolerance Range:</span>
        <span class="font-semibold text-gray-900">±${summary.toleranceRange} PSI</span>
      </div>
    </div>
  `;

  summaryDiv.className = `mt-4 p-4 rounded-lg border ${bgClass}`;
  summaryDiv.classList.remove('hidden');
}

// Calibration handlers
async function handleStartCalibration() {
  const { testerNameSelect, modelSelect, serialNumberInput } = elements;

  const testerName = testerNameSelect?.value;
  const model = modelSelect?.value;
  const serialNumber = serialNumberInput?.value;

  // Debug logging
  console.log('🔍 Debug - handleStartCalibration values:');
  console.log('🔍 Debug - testerName:', testerName);
  console.log('🔍 Debug - model:', model);
  console.log('🔍 Debug - serialNumber:', serialNumber);
  console.log('🔍 Debug - serialNumberInput element:', serialNumberInput);
  console.log('🔍 Debug - serialNumberInput.value:', serialNumberInput?.value);

  if (!testerName) {
    NotificationHelper.showError('Please select a tester name before starting calibration.');
    return;
  }

  if (!model) {
    NotificationHelper.showError('Please select a model before starting calibration.');
    return;
  }

  if (!serialNumber || serialNumber.trim() === '') {
    NotificationHelper.showError('Please enter a serial number before starting calibration.');
    return;
  }

  try {
    console.log('🔍 Debug - Calling monsterMeterStartCalibration with:', { testerName, model, serialNumber: serialNumber.trim() });
    const result = await window.electronAPI.monsterMeterStartCalibration(testerName, model, serialNumber.trim());
    if (!result.success) {
      NotificationHelper.showError(`Failed to start calibration: ${result.error}`);
    }
  } catch (error) {
    NotificationHelper.showError(`Error starting calibration: ${error.message}`);
  }
}

async function handleStopCalibration() {
  try {
    const result = await window.electronAPI.monsterMeterStopCalibration('Stopped by user');
    if (!result.success) {
      NotificationHelper.showError(`Failed to stop calibration: ${result.error}`);
    }
  } catch (error) {
    NotificationHelper.showError(`Error stopping calibration: ${error.message}`);
  }
}

function updateCalibrationButtons() {
  const { startCalibrationBtn, stopCalibrationBtn, startVerificationBtn, stopVerificationBtn, testerNameSelect, modelSelect, serialNumberInput } = elements;

  const hasTesterName = testerNameSelect?.value && testerNameSelect.value !== '';
  const hasModel = modelSelect?.value && modelSelect.value !== '';
  const hasSerialNumber = serialNumberInput?.value && serialNumberInput.value.trim() !== '';
  const canStart = isMonsterMeterConnected && hasTesterName && hasModel && hasSerialNumber;

  // Calibration buttons
  if (startCalibrationBtn) {
    const canStartCalibration = canStart && !isCalibrationActive && !isVerificationActive;
    const shouldHideCalibrationBtn = isCalibrationActive || isVerificationActive || isCalibrationCompleted;
    startCalibrationBtn.disabled = !canStartCalibration;
    startCalibrationBtn.classList.toggle('hidden', shouldHideCalibrationBtn);
  }

  if (stopCalibrationBtn) {
    stopCalibrationBtn.classList.toggle('hidden', !isCalibrationActive);
  }

  // Verification buttons - only show after calibration completes
  if (startVerificationBtn) {
    const canStartVerification = canStart && isCalibrationCompleted && !isCalibrationActive && !isVerificationActive;
    startVerificationBtn.disabled = !canStartVerification;
    startVerificationBtn.classList.toggle('hidden', !isCalibrationCompleted || isCalibrationActive || isVerificationActive);
  }

  if (stopVerificationBtn) {
    stopVerificationBtn.classList.toggle('hidden', !isVerificationActive);
  }
}

function updateCalibrationProgress(data) {
  // Update real-time calibration progress
  console.log('Calibration progress:', data);
}

function showCalibrationResultsSection() {
  const resultsSection = document.getElementById('monster-meter-calibration-results');
  if (resultsSection) {
    resultsSection.classList.remove('hidden');
    initializeCalibrationResultsTable();
  }
}

function showVerificationResultsSection() {
  const resultsSection = document.getElementById('monster-meter-calibration-results');
  if (resultsSection) {
    resultsSection.classList.remove('hidden');
    initializeVerificationResultsTable();
    // Switch to verification tab to show verification results
    switchTab('verification');
  }
}

function initializeCalibrationResultsTable() {
  const calibrationPanel = document.getElementById('monster-meter-panel-calibration');
  if (calibrationPanel) {
    calibrationPanel.innerHTML = `
      <div class="overflow-x-auto fade-in mb-6">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b">
              <th class="pb-2 pr-6">Pressure Point</th>
              <th class="pb-2 pr-6">Reference (PSI)</th>
              <th class="pb-2 pr-6">SensorHi Voltage (V)</th>
              <th class="pb-2 pr-6">SensorHi Pressure (PSI)</th>
              <th class="pb-2 pr-6">SensorLo Voltage (V)</th>
              <th class="pb-2 pr-6">SensorLo Pressure (PSI)</th>
            </tr>
          </thead>
          <tbody id="calibration-results-tbody">
            <!-- Data rows will be added here -->
          </tbody>
        </table>
      </div>
      <div class="text-sm text-neutral-500">
        <span id="calibration-progress-text">Waiting for calibration data...</span>
      </div>
    `;
  }
}

function initializeVerificationResultsTable() {
  const verificationPanel = document.getElementById('monster-meter-panel-verification');
  if (verificationPanel) {
    verificationPanel.innerHTML = `
      <div class="mb-4">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b">
              <tr>
                <th class="pb-2 pr-6 text-left">Point</th>
                <th class="pb-2 pr-6 text-left">Reference Pressure (PSI)</th>
                <th class="pb-2 pr-6 text-left">SensorHi Voltage (V)</th>
                <th class="pb-2 pr-6 text-left">SensorHi Pressure (PSI)</th>
                <th class="pb-2 pr-6 text-left">SensorLo Voltage (V)</th>
                <th class="pb-2 pr-6 text-left">SensorLo Pressure (PSI)</th>
                <th class="pb-2 pr-6 text-left">Status</th>
              </tr>
            </thead>
            <tbody id="verification-results-tbody" class="bg-white divide-y divide-gray-200">
              <!-- Verification data will be populated here -->
            </tbody>
          </table>
        </div>
        <div id="verification-progress-text" class="mt-2 text-sm text-neutral-500">Waiting for verification data...</div>
        <div id="verification-summary" class="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hidden">
          <!-- Verification summary will be populated here -->
        </div>
      </div>
    `;
  }
}

function updateCalibrationResultsTable(data) {
  const tbody = document.getElementById('calibration-results-tbody');
  const progressText = document.getElementById('calibration-progress-text');

  if (!tbody || !data.pressureArr || !data.voltagesHiArray) return;

  // Clear existing rows
  tbody.innerHTML = '';

  // Add rows for each data point (matching old app format)
  for (let i = 0; i < data.pressureArr.length; i++) {
    const row = document.createElement('tr');
    const isComplete = i < data.voltagesHiArray.length;

    row.className = 'border-b';
    row.innerHTML = `
      <td class="py-2 pr-6">Point ${i + 1}</td>
      <td class="py-2 pr-6">${data.pressureArr[i]}</td>
      <td class="py-2 pr-6">${isComplete ? data.voltagesHiArray[i].toFixed(7) : '-'}</td>
      <td class="py-2 pr-6">${isComplete ? data.pressureHiArray[i].toFixed(1) : '-'}</td>
      <td class="py-2 pr-6">${isComplete ? data.voltagesLoArray[i].toFixed(7) : '-'}</td>
      <td class="py-2 pr-6">${isComplete ? data.pressureLoArray[i].toFixed(1) : '-'}</td>
    `;

    tbody.appendChild(row);
  }

  // Update progress text
  if (progressText) {
    const completed = data.voltagesHiArray.length;
    const total = data.pressureArr.length;
    progressText.textContent = `Progress: ${completed}/${total} points completed`;
  }
}

function showCalibrationResults(data) {
  // Show final calibration results with coefficients (matching old app format)
  const calibrationPanel = document.getElementById('monster-meter-panel-calibration');
  if (calibrationPanel && data.coefficients) {
    // Generate table HTML (same as updateCalibrationResultsTable but for final results)
    let tableHTML = `
      <div class="overflow-x-auto fade-in mb-6">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b">
              <th class="pb-2 pr-6">Pressure Point</th>
              <th class="pb-2 pr-6">Reference (PSI)</th>
              <th class="pb-2 pr-6">SensorHi Voltage (V)</th>
              <th class="pb-2 pr-6">SensorHi Pressure (PSI)</th>
              <th class="pb-2 pr-6">SensorLo Voltage (V)</th>
              <th class="pb-2 pr-6">SensorLo Pressure (PSI)</th>
            </tr>
          </thead>
          <tbody>`;

    // Add all completed rows
    for (let i = 0; i < data.pressureArr.length; i++) {
      tableHTML += `
        <tr class="border-b">
          <td class="py-2 pr-6">Point ${i + 1}</td>
          <td class="py-2 pr-6">${data.pressureArr[i]}</td>
          <td class="py-2 pr-6">${data.voltagesHiArray[i].toFixed(7)}</td>
          <td class="py-2 pr-6">${data.pressureHiArray[i].toFixed(1)}</td>
          <td class="py-2 pr-6">${data.voltagesLoArray[i].toFixed(7)}</td>
          <td class="py-2 pr-6">${data.pressureLoArray[i].toFixed(1)}</td>
        </tr>`;
    }

    tableHTML += `
          </tbody>
        </table>
      </div>
      ${showCoefficients(data.coefficients)}`;

    calibrationPanel.innerHTML = tableHTML;
  }

  // Enable verification tab
  enableVerificationTab();
}

function showCoefficients(coefficients) {
  const sensorHi = coefficients.hi || {};
  const sensorLo = coefficients.lo || {};

  return `
    <div class="mt-4 rounded-md bg-neutral-50 p-4">
      <h3 class="mb-4 font-semibold text-sm text-neutral-700">Sensor Coefficients</h3>
      <div class="flex flex-wrap gap-8 text-xs text-neutral-600">
        <div>
          <h4 class="font-semibold text-neutral-700 mb-1">Sensor Hi</h4>
          <ul class="ml-2 space-y-1">
            <li>A: ${sensorHi.coeffA}</li>
            <li>B: ${sensorHi.coeffB}</li>
            <li>C: ${sensorHi.coeffC}</li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold text-neutral-700 mb-1">Sensor Lo</h4>
          <ul class="ml-2 space-y-1">
            <li>A: ${sensorLo.coeffA}</li>
            <li>B: ${sensorLo.coeffB}</li>
            <li>C: ${sensorLo.coeffC}</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

function updateLiveSensorData(data) {
  // Update reference pressure
  const referencePressureEl = document.getElementById('monster-meter-reference-pressure-value');
  if (referencePressureEl && data.referencePressure !== undefined) {
    referencePressureEl.textContent = `${data.referencePressure.toFixed(1)} PSI`;
  }

  // Update SensorHi voltage
  const sensorHiVoltageEl = document.getElementById('live-monster-meter-sensorhi-voltage-value');
  if (sensorHiVoltageEl && data.voltageHi !== undefined) {
    sensorHiVoltageEl.textContent = `${data.voltageHi.toFixed(7)} V`;
  }

  // Update SensorHi pressure
  const sensorHiPressureEl = document.getElementById('live-monster-meter-sensorhi-pressure-value');
  if (sensorHiPressureEl && data.pressureHi !== undefined) {
    sensorHiPressureEl.textContent = `${data.pressureHi.toFixed(1)} PSI`;
  }

  // Update SensorLo voltage
  const sensorLoVoltageEl = document.getElementById('live-monster-meter-sensorlo-voltage-value');
  if (sensorLoVoltageEl && data.voltageLo !== undefined) {
    sensorLoVoltageEl.textContent = `${data.voltageLo.toFixed(7)} V`;
  }

  // Update SensorLo pressure
  const sensorLoPressureEl = document.getElementById('live-monster-meter-sensorlo-pressure-value');
  if (sensorLoPressureEl && data.pressureLo !== undefined) {
    sensorLoPressureEl.textContent = `${data.pressureLo.toFixed(1)} PSI`;
  }
}

function clearCalibrationData() {
  // Clear the calibration results table
  const tbody = document.getElementById('calibration-results-tbody');
  if (tbody) {
    tbody.innerHTML = '';
  }

  // Reset progress text
  const progressText = document.getElementById('calibration-progress-text');
  if (progressText) {
    progressText.textContent = 'Waiting for calibration data...';
  }

  // Hide calibration results section
  const resultsSection = document.getElementById('monster-meter-calibration-results');
  if (resultsSection) {
    resultsSection.classList.add('hidden');
  }

  // Reset verification tab to disabled state
  const verificationTab = document.getElementById('monster-meter-tab-verification');
  if (verificationTab) {
    verificationTab.disabled = true;
    verificationTab.className = 'tab-button bg-neutral-300 text-neutral-500 px-4 py-2 rounded cursor-not-allowed';
  }

  // Switch back to calibration tab
  switchTab('calibration');

  // Reset calibration completed flag
  isCalibrationCompleted = false;
}

function enableVerificationTab() {
  const verificationTab = document.getElementById('monster-meter-tab-verification');
  if (verificationTab) {
    verificationTab.disabled = false;
    verificationTab.className = 'tab-button bg-neutral-900 text-white px-4 py-2 rounded';
  }
}

function switchTab(tabName) {
  const calibrationTab = document.getElementById('monster-meter-tab-calibration');
  const verificationTab = document.getElementById('monster-meter-tab-verification');
  const calibrationPanel = document.getElementById('monster-meter-panel-calibration');
  const verificationPanel = document.getElementById('monster-meter-panel-verification');

  // Reset all tabs
  [calibrationTab, verificationTab].forEach(tab => {
    if (tab) {
      tab.className = 'tab-button bg-neutral-300 text-neutral-500 px-4 py-2 rounded';
    }
  });

  // Hide all panels
  [calibrationPanel, verificationPanel].forEach(panel => {
    if (panel) {
      panel.style.display = 'none';
    }
  });

  // Activate selected tab and panel
  if (tabName === 'calibration') {
    if (calibrationTab) calibrationTab.className = 'tab-button bg-neutral-900 text-white px-4 py-2 rounded';
    if (calibrationPanel) calibrationPanel.style.display = 'block';
  } else if (tabName === 'verification') {
    if (verificationTab && !verificationTab.disabled) {
      verificationTab.className = 'tab-button bg-neutral-900 text-white px-4 py-2 rounded';
      if (verificationPanel) verificationPanel.style.display = 'block';
    }
  }
}

async function handleStartVerification() {
  const { testerNameSelect, modelSelect, serialNumberInput } = elements;
  const testerName = testerNameSelect?.value;
  const model = modelSelect?.value;
  const serialNumber = serialNumberInput?.value?.trim();

  if (!testerName || !model || !serialNumber) {
    NotificationHelper.showCustomAlertModal('Please fill in all required fields before starting verification.');
    return;
  }

  try {
    const result = await window.electronAPI.monsterMeterStartVerification(testerName, model, serialNumber);
    if (!result.success) {
      NotificationHelper.showError(`Failed to start verification: ${result.error}`);
    }
  } catch (error) {
    NotificationHelper.showError(`Error starting verification: ${error.message}`);
  }
}

async function handleStopVerification() {
  try {
    const result = await window.electronAPI.monsterMeterStopVerification('Stopped by user');
    if (!result.success) {
      NotificationHelper.showError(`Failed to stop verification: ${result.error}`);
    }
  } catch (error) {
    NotificationHelper.showError(`Error stopping verification: ${error.message}`);
  }
}

function hideStartVerificationButton() {
  const startVerificationBtn = document.getElementById('start-verification-btn');
  if (startVerificationBtn) {
    startVerificationBtn.classList.add('hidden');
  }
}

function showViewPDFButton(filePath, filename) {
  // Remove existing view PDF button if any
  const existingBtn = document.getElementById('view-pdf-btn');
  if (existingBtn) {
    existingBtn.remove();
  }

  // Create view PDF button
  const viewPDFBtn = document.createElement('button');
  viewPDFBtn.id = 'view-pdf-btn';
  viewPDFBtn.className = 'px-4 py-2 bg-neutral-800 text-white rounded-md hover:bg-neutral-700 transition-colors duration-200 text-sm w-full';
  viewPDFBtn.innerHTML =
    '<svg class="w-3 h-3 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg> View PDF';

  // Add click handler to open PDF
  viewPDFBtn.addEventListener('click', () => {
    window.electronAPI.openPDF(filePath);
  });

  // Insert button in the Monster Meter widget after port information
  const pdfContainer = document.getElementById('pdf-button-container');
  if (pdfContainer) {
    pdfContainer.appendChild(viewPDFBtn);
  }
}

// Initialize
setupEventListeners();
populateTesterNames();
populateModelOptions();
window.addEventListener('beforeunload', cleanupMonsterMeterModule);
