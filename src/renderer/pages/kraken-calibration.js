/**
 * Kraken Calibration Page Script
 * Handles calibration process control and monitoring
 */

// State management
let connectedDevices = [];
let currentProcess = 'idle';
let calibrationSettings = {
  testerName: '',
  maxPressure: 100,
};
let activeTab = 'calibration';

// DOM Elements
let elements = {};

document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  setupEventListeners();
  loadConnectedDevices();
  loadSavedSettings();
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
  elements = {
    backButton: document.getElementById('back-button'),
    testerName: document.getElementById('tester-name'),
    maxPressure: document.getElementById('max-pressure'),
    saveSettings: document.getElementById('save-settings'),
    sensorCards: document.getElementById('sensor-cards'),
    referenceValue: document.getElementById('reference-value'),
    startCalibration: document.getElementById('start-calibration'),
    startVerification: document.getElementById('start-verification'),
    startCertification: document.getElementById('start-certification'),
    stopProcess: document.getElementById('stop-process'),
    viewResults: document.getElementById('view-results'),
    logContent: document.getElementById('log-content'),
    clearLogs: document.getElementById('clear-logs'),
    sweepResults: document.getElementById('sweep-results'),
    resultsTable: document.getElementById('results-table'),
    deviceCalibration: document.getElementById('device-calibration'),
    calibrationProgress: document.getElementById('calibration-progress'),
    tabCalibration: document.getElementById('tab-calibration'),
    tabVerification: document.getElementById('tab-verification'),
    tabCertification: document.getElementById('tab-certification'),
    alertModal: document.getElementById('alert-modal'),
    alertIcon: document.getElementById('alert-icon'),
    alertMessage: document.getElementById('alert-message'),
    alertOk: document.getElementById('alert-ok'),
  };
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Navigation
  elements.backButton.addEventListener('click', () => {
    window.electronAPI.send('kraken:load-device-list');
  });

  // Settings
  elements.saveSettings.addEventListener('click', saveSettings);

  // Process control
  elements.startCalibration.addEventListener('click', startCalibration);
  elements.startVerification.addEventListener('click', startVerification);
  elements.startCertification.addEventListener('click', startCertification);
  elements.stopProcess.addEventListener('click', stopProcess);
  elements.viewResults.addEventListener('click', viewResults);

  // Logs
  elements.clearLogs.addEventListener('click', clearLogs);

  // Tabs
  elements.tabCalibration.addEventListener('click', () => switchTab('calibration'));
  elements.tabVerification.addEventListener('click', () => switchTab('verification'));
  elements.tabCertification.addEventListener('click', () => switchTab('certification'));

  // Modal
  elements.alertOk.addEventListener('click', closeAlert);

  // Kraken service event listeners
  setupKrakenEventListeners();
}

/**
 * Setup Kraken service event listeners
 */
function setupKrakenEventListeners() {
  // Pressure data
  window.electronAPI.on('kraken:pressure-data', (data) => {
    updateSensorPressure(data.deviceId, data.pressure);
  });

  // Process events
  window.electronAPI.on('kraken:process-started', (processType) => {
    handleProcessStarted(processType);
  });

  window.electronAPI.on('kraken:process-completed', (processType) => {
    handleProcessCompleted(processType);
  });

  window.electronAPI.on('kraken:process-error', (error) => {
    handleProcessError(error);
  });

  window.electronAPI.on('kraken:process-stopped', () => {
    handleProcessStopped();
  });

  // Calibration logs
  window.electronAPI.on('kraken:calibration-log', (message) => {
    addLogMessage(message);
  });

  // Sweep data updates
  window.electronAPI.on('kraken:sweep-data-updated', (data) => {
    updateSweepResults(data);
  });

  // Reference pressure updates
  window.electronAPI.on('kraken:reference-pressure-updated', (pressure) => {
    elements.referenceValue.textContent = pressure;
  });

  // Device calibration progress
  window.electronAPI.on('kraken:device-calibration-started', (data) => {
    showDeviceCalibrationProgress(data);
  });

  window.electronAPI.on('kraken:device-calibration-progress', (data) => {
    updateDeviceCalibrationProgress(data);
  });
}

/**
 * Load connected devices
 */
async function loadConnectedDevices() {
  try {
    const result = await window.electronAPI.invoke('kraken:get-connected-devices');
    if (result.success) {
      connectedDevices = result.devices;
      renderSensorCards();
    } else {
      showAlert('error', 'Error', 'Failed to load connected devices');
    }
  } catch (error) {
    showAlert('error', 'Error', 'Failed to load connected devices');
  }
}

/**
 * Load saved settings
 */
function loadSavedSettings() {
  const saved = localStorage.getItem('krakenCalibrationSettings');
  if (saved) {
    try {
      calibrationSettings = JSON.parse(saved);
      elements.testerName.value = calibrationSettings.testerName || '';
      elements.maxPressure.value = calibrationSettings.maxPressure || 100;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
}

/**
 * Save calibration settings
 */
function saveSettings() {
  calibrationSettings = {
    testerName: elements.testerName.value.trim(),
    maxPressure: parseInt(elements.maxPressure.value),
  };

  if (!calibrationSettings.testerName) {
    showAlert('warning', 'Invalid Input', 'Please enter a tester name');
    return;
  }

  localStorage.setItem('krakenCalibrationSettings', JSON.stringify(calibrationSettings));
  showAlert('success', 'Settings Saved', 'Calibration settings have been saved');
}

/**
 * Render sensor cards
 */
function renderSensorCards() {
  let html = '';

  connectedDevices.forEach(device => {
    html += `
      <div class="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-semibold">${device.name}</h3>
          <span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
            Connected
          </span>
        </div>
        <div class="text-sm text-neutral-600 space-y-1">
          <p>ID: <span class="font-mono">${device.id}</span></p>
          <p>Firmware: ${device.firmwareVersion || 'Unknown'}</p>
          <p>Pressure: <span id="pressure-${device.id}" class="font-semibold">${device.pressureValue || 0}</span> PSI</p>
        </div>
      </div>
    `;
  });

  if (connectedDevices.length === 0) {
    html = `
      <div class="col-span-full text-center py-8 text-neutral-500">
        <i class="fa-solid fa-exclamation-triangle text-4xl mb-4"></i>
        <p>No devices connected</p>
        <button 
          onclick="window.electronAPI.send('kraken:load-device-list')"
          class="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Go to Device List
        </button>
      </div>
    `;
  }

  elements.sensorCards.innerHTML = html;
}

/**
 * Update sensor pressure display
 */
function updateSensorPressure(deviceId, pressure) {
  const element = document.getElementById(`pressure-${deviceId}`);
  if (element) {
    element.textContent = pressure.toFixed(1);
  }
}

/**
 * Start calibration process
 */
async function startCalibration() {
  if (!validateSettings()) return;

  try {
    const result = await window.electronAPI.invoke('kraken:start-calibration', {
      sweepValue: calibrationSettings.maxPressure,
      testerName: calibrationSettings.testerName,
      buttonTitle: 'Start Calibration',
    });

    if (!result.success) {
      showAlert('error', 'Calibration Failed', result.error);
    }
  } catch (error) {
    showAlert('error', 'Calibration Failed', 'Failed to start calibration process');
  }
}

/**
 * Start verification process
 */
async function startVerification() {
  try {
    const result = await window.electronAPI.invoke('kraken:start-verification');
    if (!result.success) {
      showAlert('error', 'Verification Failed', result.error);
    }
  } catch (error) {
    showAlert('error', 'Verification Failed', 'Failed to start verification process');
  }
}

/**
 * Start certification process
 */
async function startCertification() {
  try {
    const result = await window.electronAPI.invoke('kraken:start-certification');
    if (!result.success) {
      showAlert('error', 'Certification Failed', result.error);
    }
  } catch (error) {
    showAlert('error', 'Certification Failed', 'Failed to start certification process');
  }
}

/**
 * Stop current process
 */
async function stopProcess() {
  try {
    const result = await window.electronAPI.invoke('kraken:stop-process');
    if (!result.success) {
      showAlert('error', 'Stop Failed', result.error);
    }
  } catch (error) {
    showAlert('error', 'Stop Failed', 'Failed to stop process');
  }
}

/**
 * View results
 */
function viewResults() {
  window.electronAPI.send('kraken:load-results');
}

/**
 * Validate calibration settings
 */
function validateSettings() {
  if (!calibrationSettings.testerName) {
    showAlert('warning', 'Invalid Settings', 'Please save calibration settings first');
    return false;
  }

  if (connectedDevices.length === 0) {
    showAlert('warning', 'No Devices', 'Please connect devices before starting calibration');
    return false;
  }

  return true;
}

/**
 * Handle process started event
 */
function handleProcessStarted(processType) {
  currentProcess = processType;
  updateProcessButtons();
  addLogMessage(`${processType.charAt(0).toUpperCase() + processType.slice(1)} process started`);
  
  if (processType === 'calibration') {
    elements.sweepResults.classList.remove('hidden');
    switchTab('calibration');
  }
}

/**
 * Handle process completed event
 */
function handleProcessCompleted(processType) {
  currentProcess = 'idle';
  updateProcessButtons();
  addLogMessage(`${processType.charAt(0).toUpperCase() + processType.slice(1)} process completed successfully`);
  
  // Show appropriate next step buttons
  if (processType === 'calibration') {
    elements.startVerification.classList.remove('hidden');
  } else if (processType === 'verification') {
    elements.startCertification.classList.remove('hidden');
  }
  
  elements.viewResults.classList.remove('hidden');
}

/**
 * Handle process error event
 */
function handleProcessError(error) {
  currentProcess = 'idle';
  updateProcessButtons();
  addLogMessage(`Process error: ${error.error}`, 'error');
  showAlert('error', 'Process Error', error.error);
}

/**
 * Handle process stopped event
 */
function handleProcessStopped() {
  currentProcess = 'idle';
  updateProcessButtons();
  addLogMessage('Process stopped by user', 'warning');
}

/**
 * Update process control buttons
 */
function updateProcessButtons() {
  const isRunning = currentProcess !== 'idle';
  
  elements.startCalibration.disabled = isRunning;
  elements.startVerification.disabled = isRunning;
  elements.startCertification.disabled = isRunning;
  
  if (isRunning) {
    elements.stopProcess.classList.remove('hidden');
  } else {
    elements.stopProcess.classList.add('hidden');
  }
}

/**
 * Add log message
 */
function addLogMessage(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const colorClass = {
    'info': 'text-green-400',
    'warning': 'text-yellow-400',
    'error': 'text-red-400',
  }[type] || 'text-green-400';
  
  const logEntry = document.createElement('p');
  logEntry.className = colorClass;
  logEntry.textContent = `[${timestamp}] ${message}`;
  
  elements.logContent.appendChild(logEntry);
  elements.logContent.scrollTop = elements.logContent.scrollHeight;
}

/**
 * Clear logs
 */
function clearLogs() {
  elements.logContent.innerHTML = '<p class="text-neutral-400">Logs cleared...</p>';
}

/**
 * Switch results tab
 */
function switchTab(tab) {
  activeTab = tab;
  
  // Update tab buttons
  [elements.tabCalibration, elements.tabVerification, elements.tabCertification].forEach(btn => {
    btn.classList.remove('bg-blue-600', 'text-white');
    btn.classList.add('bg-neutral-300', 'text-neutral-700');
  });
  
  const activeButton = {
    'calibration': elements.tabCalibration,
    'verification': elements.tabVerification,
    'certification': elements.tabCertification,
  }[tab];
  
  if (activeButton) {
    activeButton.classList.remove('bg-neutral-300', 'text-neutral-700');
    activeButton.classList.add('bg-blue-600', 'text-white');
  }
  
  // Update results table
  renderResultsTable();
}

/**
 * Update sweep results
 */
function updateSweepResults(data) {
  connectedDevices = data.devices;
  renderResultsTable();
}

/**
 * Render results table
 */
function renderResultsTable() {
  if (connectedDevices.length === 0) {
    elements.resultsTable.innerHTML = '<p class="text-neutral-500 text-center py-4">No data available</p>';
    return;
  }

  let html = '<div class="overflow-x-auto"><table class="w-full text-sm">';
  html += '<thead class="bg-neutral-50"><tr>';
  html += '<th class="px-4 py-2 text-left">Reference (PSI)</th>';
  
  connectedDevices.forEach(device => {
    html += `<th class="px-4 py-2 text-left">${device.name}</th>`;
  });
  
  html += '</tr></thead><tbody>';
  
  // Get sweep data for active tab
  const sweepData = getSweepDataForTab(activeTab);
  
  if (sweepData.length > 0) {
    // Group by reference pressure
    const groupedData = groupByReferencePressure(sweepData);
    
    Object.keys(groupedData).sort((a, b) => parseFloat(a) - parseFloat(b)).forEach(refPressure => {
      html += '<tr class="border-t border-neutral-200">';
      html += `<td class="px-4 py-2 font-semibold">${refPressure}</td>`;
      
      connectedDevices.forEach(device => {
        const reading = groupedData[refPressure][device.id];
        if (reading) {
          const bgColor = reading.inRange ? 'bg-green-50' : 'bg-red-50';
          const textColor = reading.inRange ? 'text-green-800' : 'text-red-800';
          html += `<td class="px-4 py-2 ${bgColor} ${textColor}">
            ${reading.sensorPressure} 
            <span class="text-xs">(±${reading.discrepancy})</span>
          </td>`;
        } else {
          html += '<td class="px-4 py-2 text-neutral-400">-</td>';
        }
      });
      
      html += '</tr>';
    });
  } else {
    html += `<tr><td colspan="${connectedDevices.length + 1}" class="px-4 py-8 text-center text-neutral-500">
      No ${activeTab} data available
    </td></tr>`;
  }
  
  html += '</tbody></table></div>';
  elements.resultsTable.innerHTML = html;
}

/**
 * Get sweep data for active tab
 */
function getSweepDataForTab(tab) {
  if (connectedDevices.length === 0) return [];
  
  const dataProperty = {
    'calibration': 'calibrationSweepData',
    'verification': 'verificationSweepData',
    'certification': 'certificationSweepData',
  }[tab];
  
  return connectedDevices[0][dataProperty] || [];
}

/**
 * Group sweep data by reference pressure
 */
function groupByReferencePressure(sweepData) {
  const grouped = {};
  
  sweepData.forEach(reading => {
    const refPressure = reading.referencePressure.toString();
    if (!grouped[refPressure]) {
      grouped[refPressure] = {};
    }
    
    // For now, assume readings are for the first device
    // In a real implementation, you'd need to track device-specific readings
    grouped[refPressure]['device-1'] = reading;
  });
  
  return grouped;
}

/**
 * Show device calibration progress
 */
function showDeviceCalibrationProgress(data) {
  elements.deviceCalibration.classList.remove('hidden');
  
  let html = `
    <div id="progress-${data.id}" class="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold">${data.name}</h3>
        <span id="status-${data.id}" class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
          ${data.status}
        </span>
      </div>
      <div class="w-full bg-neutral-200 rounded-full h-2">
        <div 
          id="progress-bar-${data.id}"
          class="bg-blue-600 h-2 rounded-full transition-all duration-300" 
          style="width: ${data.progress || 0}%"
        ></div>
      </div>
    </div>
  `;
  
  elements.calibrationProgress.innerHTML = html;
}

/**
 * Update device calibration progress
 */
function updateDeviceCalibrationProgress(data) {
  const statusElement = document.getElementById(`status-${data.id}`);
  const progressBar = document.getElementById(`progress-bar-${data.id}`);
  
  if (statusElement) {
    statusElement.textContent = data.status;
  }
  
  if (progressBar) {
    progressBar.style.width = `${data.progress}%`;
  }
}

/**
 * Show alert modal
 */
function showAlert(type, title, message) {
  const iconClasses = {
    'error': 'fa-exclamation-circle text-red-500',
    'warning': 'fa-exclamation-triangle text-yellow-500',
    'info': 'fa-info-circle text-blue-500',
    'success': 'fa-check-circle text-green-500'
  };
  
  elements.alertIcon.className = `fa-solid ${iconClasses[type] || iconClasses.info} text-4xl mb-4`;
  elements.alertMessage.innerHTML = `<strong>${title}</strong><br>${message}`;
  elements.alertModal.classList.remove('hidden');
}

/**
 * Close alert modal
 */
function closeAlert() {
  elements.alertModal.classList.add('hidden');
}
