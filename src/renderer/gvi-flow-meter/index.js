import * as NotificationHelper from '../../shared/helpers/notification-helper.js';

// Application state
let calibrationInProgress = false;
let eventListenersSetup = false;

// DOM elements cache
const elements = {
  backBtn: null,
  modelSelect: null,
  testerSelect: null,
  serialNumberInput: null,
  startCalibrationBtn: null,
  passBtn: null,
  failBtn: null,
  calibrationTable: null,
  calibrationLogs: null,
  pageLoader: null,
};

// Calibration data
const calibrationSteps = [
  { gpm: 1250, psiMin: 1.15, psiMax: 2.29, status: 'pending' },
  { gpm: 2000, psiMin: 3.75, psiMax: 4.83, status: 'pending' },
  { gpm: 2500, psiMin: 6.21, psiMax: 7.29, status: 'pending' },
  { gpm: 3500, psiMin: 12.72, psiMax: 13.8, status: 'pending' },
  { gpm: 4500, psiMin: 21.72, psiMax: 22.37, status: 'pending' },
  { gpm: 5000, psiMin: 26.43, psiMax: 27.51, status: 'pending' },
];

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  setupEventListeners();
  await loadAvailableModels();
  initializeCalibrationTable();
  updateStartButtonState();
  addLogMessage('GVI Flow Meter calibration system initialized');
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
  elements.backBtn = document.getElementById('back-btn');
  elements.modelSelect = document.getElementById('model-select');
  elements.testerSelect = document.getElementById('tester-select');
  elements.serialNumberInput = document.getElementById('serial-number');
  elements.startCalibrationBtn = document.getElementById('start-calibration-btn');
  elements.passBtn = document.getElementById('pass-btn');
  elements.failBtn = document.getElementById('fail-btn');
  elements.calibrationTable = document.getElementById('calibration-table');
  elements.calibrationLogs = document.getElementById('calibration-logs');
  elements.pageLoader = document.getElementById('page-loader');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  if (eventListenersSetup) return;

  // DOM event listeners
  elements.backBtn?.addEventListener('click', () => {
    if (calibrationInProgress) {
      NotificationHelper.showWarning('Cannot go back during calibration. Please stop calibration first.');
      return;
    }
    if (window.electronAPI && window.electronAPI.gviGoBack) {
      window.electronAPI.gviGoBack();
    }
  });

  elements.startCalibrationBtn?.addEventListener('click', handleStartCalibration);
  elements.passBtn?.addEventListener('click', () => handleStepResult('pass'));
  elements.failBtn?.addEventListener('click', () => handleStepResult('fail'));

  // Form change handlers
  elements.modelSelect?.addEventListener('change', async () => {
    updateStartButtonState();
    await handleModelChange();
  });
  elements.testerSelect?.addEventListener('change', updateStartButtonState);
  elements.serialNumberInput?.addEventListener('input', updateStartButtonState);

  // IPC event listeners
  window.electronAPI.onShowPageLoader?.(() => {
    elements.pageLoader?.classList.remove('hidden');
  });

  window.electronAPI.onHidePageLoader?.(() => {
    elements.pageLoader?.classList.add('hidden');
  });

  // GVI specific event listeners
  window.electronAPI.onGVIInitialized?.(() => {
    addLogMessage('GVI controller initialized');
  });

  window.electronAPI.onGVICalibrationStarted?.(data => {
    addLogMessage(`Calibration started - ${data.totalSteps} steps`);
    updateCalibrationUI(true);
  });

  window.electronAPI.onGVICalibrationStopped?.(() => {
    calibrationInProgress = false;
    addLogMessage('Calibration stopped');
    updateCalibrationUI(false);
  });

  window.electronAPI.onGVIStepUpdated?.(data => {
    addLogMessage(`Step ${data.stepIndex + 1} completed: ${data.stepData.status.toUpperCase()}`);
    updateStepStatus(data.stepIndex, data.stepData.status);

    if (data.completed) {
      calibrationInProgress = false;
      updateCalibrationUI(false);
      addLogMessage('All calibration steps completed');
    }
  });

  window.electronAPI.onGVICalibrationCompleted?.(data => {
    addLogMessage('Calibration completed successfully');
    addLogMessage(`Summary: ${data.summary.passedSteps}/${data.summary.totalSteps} steps passed`);
    NotificationHelper.showSuccess(`Calibration completed: ${data.summary.overallResult}`);
  });

  window.electronAPI.onGVILogMessage?.(data => {
    addLogMessage(data.message);
  });

  eventListenersSetup = true;
}

/**
 * Load available models from database and populate dropdown
 */
async function loadAvailableModels() {
  try {
    const result = await window.electronAPI.gviGetAvailableModels();
    if (result.success && result.models) {
      const modelSelect = elements.modelSelect;
      if (modelSelect) {
        // Clear existing options
        modelSelect.innerHTML = '<option value="">Choose Model</option>';
        
        // Add models from database
        result.models.forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        });
        
        addLogMessage(`Loaded ${result.models.length} models from database`);
      }
    } else {
      addLogMessage('Failed to load models from database', 'error');
    }
  } catch (error) {
    addLogMessage(`Error loading models: ${error.message}`, 'error');
  }
}

/**
 * Handle model selection change - load calibration steps for selected model
 */
async function handleModelChange() {
  const selectedModel = elements.modelSelect?.value;
  if (!selectedModel) {
    // Reset to default steps if no model selected
    calibrationSteps.length = 0;
    calibrationSteps.push(
      { gpm: 1250, psiMin: 1.15, psiMax: 2.29, status: 'pending' },
      { gpm: 2000, psiMin: 3.75, psiMax: 4.83, status: 'pending' },
      { gpm: 2500, psiMin: 6.21, psiMax: 7.29, status: 'pending' },
      { gpm: 3500, psiMin: 12.72, psiMax: 13.8, status: 'pending' },
      { gpm: 4500, psiMin: 21.72, psiMax: 22.37, status: 'pending' },
      { gpm: 5000, psiMin: 26.43, psiMax: 27.51, status: 'pending' }
    );
    updateCalibrationTable();
    return;
  }

  try {
    const result = await window.electronAPI.gviGetCalibrationSteps(selectedModel);
    if (result.success && result.steps) {
      // Update global calibration steps with database data
      calibrationSteps.length = 0;
      calibrationSteps.push(...result.steps);
      
      updateCalibrationTable();
      addLogMessage(`Loaded ${result.steps.length} calibration steps for ${selectedModel}`);
    } else {
      addLogMessage(`Failed to load calibration steps for ${selectedModel}`, 'error');
    }
  } catch (error) {
    addLogMessage(`Error loading calibration steps: ${error.message}`, 'error');
  }
}

/**
 * Update the calibration table with current steps data
 */
function updateCalibrationTable() {
  if (!elements.calibrationTable) return;

  elements.calibrationTable.innerHTML = calibrationSteps.map((step, index) => {
    const statusClass = getStatusClass(step.status);
    const statusText = getStatusText(step.status);
    
    return `
      <tr id="step-${index}" class="${step.status === 'current' ? 'bg-blue-50' : ''}">
        <td class="px-3 py-2 border border-neutral-200 font-medium">${step.gpm}</td>
        <td class="px-3 py-2 border border-neutral-200">${step.psiMin}</td>
        <td class="px-3 py-2 border border-neutral-200">${step.psiMax}</td>
        <td class="px-3 py-2 border border-neutral-200">
          <span class="px-2 py-1 ${statusClass} rounded text-xs">${statusText}</span>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Initialize the calibration table with default data
 */
function initializeCalibrationTable() {
  updateCalibrationTable();
}

/**
 * Update the start calibration button state based on form validation
 */
function updateStartButtonState() {
  const isValid = validateForm();
  const btn = elements.startCalibrationBtn;

  if (btn) {
    btn.disabled = !isValid || calibrationInProgress;
    btn.classList.toggle('opacity-50', !isValid || calibrationInProgress);
    btn.classList.toggle('cursor-not-allowed', !isValid || calibrationInProgress);
  }
}

/**
 * Validate the form inputs
 */
function validateForm() {
  const model = elements.modelSelect?.value;
  const tester = elements.testerSelect?.value;
  const serialNumber = elements.serialNumberInput?.value?.trim();

  return !!(model && tester && serialNumber);
}

/**
 * Handle start calibration button click
 */
async function handleStartCalibration() {
  if (!validateForm()) {
    NotificationHelper.showError('Please fill in all required fields');
    return;
  }

  const config = {
    model: elements.modelSelect.value,
    tester: elements.testerSelect.value,
    serialNumber: elements.serialNumberInput.value.trim()
  };

  try {
    calibrationInProgress = true;
    updateStartButtonState();
    addLogMessage('Starting calibration process...');

    const result = await window.electronAPI.gviStartCalibration(config);

    if (result.success) {
      addLogMessage('Calibration started successfully');
      NotificationHelper.showSuccess('Calibration started');
      updateCalibrationUI(true);
    } else {
      throw new Error(result.error || 'Failed to start calibration');
    }
  } catch (error) {
    calibrationInProgress = false;
    updateStartButtonState();
    addLogMessage(`Error starting calibration: ${error.message}`, 'error');
    NotificationHelper.showError(`Failed to start calibration: ${error.message}`);
  }
}

/**
 * Handle step result (pass/fail)
 */
async function handleStepResult(result) {
  if (!calibrationInProgress) {
    NotificationHelper.showWarning('No calibration in progress');
    return;
  }

  try {
    const stepData = {
      result: result,
      timestamp: new Date().toISOString(),
    };

    const response = await window.electronAPI.gviUpdateStep(stepData);

    if (response.success) {
      addLogMessage(`Step marked as ${result.toUpperCase()}`);
      updateStepStatus(response.currentStep, result);

      if (response.completed) {
        calibrationInProgress = false;
        updateCalibrationUI(false);
        addLogMessage('Calibration completed');
        NotificationHelper.showSuccess('Calibration completed');
      }
    } else {
      throw new Error(response.error || 'Failed to update step');
    }
  } catch (error) {
    addLogMessage(`Error updating step: ${error.message}`, 'error');
    NotificationHelper.showError(`Failed to update step: ${error.message}`);
  }
}

/**
 * Update calibration UI state
 */
function updateCalibrationUI(isActive) {
  const startBtn = elements.startCalibrationBtn;
  const passBtn = elements.passBtn;
  const failBtn = elements.failBtn;

  if (startBtn) {
    if (isActive) {
      startBtn.textContent = 'Calibration Running...';
      startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Calibration Running...';
    } else {
      startBtn.textContent = 'Start Calibration';
      startBtn.innerHTML = '<i class="fa-solid fa-play mr-2"></i>Start Calibration';
    }
  }

  if (passBtn) {
    passBtn.disabled = !isActive;
    passBtn.classList.toggle('opacity-50', !isActive);
  }

  if (failBtn) {
    failBtn.disabled = !isActive;
    failBtn.classList.toggle('opacity-50', !isActive);
  }

  updateStartButtonState();
}

/**
 * Update step status in the table
 */
function updateStepStatus(stepIndex, status) {
  const row = document.getElementById(`step-${stepIndex}`);
  if (!row) return;

  // Remove current highlighting
  document.querySelectorAll('#calibration-table tr').forEach(r => {
    r.classList.remove('bg-blue-50');
  });

  // Update status cell
  const statusCell = row.cells[3];
  const statusClass = getStatusClass(status);
  const statusText = getStatusText(status);

  statusCell.innerHTML = `<span class="px-2 py-1 ${statusClass} rounded text-xs">${statusText}</span>`;

  // Highlight next step if not completed
  if (stepIndex + 1 < calibrationSteps.length) {
    const nextRow = document.getElementById(`step-${stepIndex + 1}`);
    nextRow?.classList.add('bg-blue-50');
  }
}

/**
 * Get CSS class for status
 */
function getStatusClass(status) {
  switch (status) {
    case 'pass':
      return 'bg-green-100 text-green-800';
    case 'fail':
      return 'bg-red-100 text-red-800';
    case 'current':
      return 'bg-blue-100 text-blue-800';
    case 'pending':
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get display text for status
 */
function getStatusText(status) {
  switch (status) {
    case 'pass':
      return 'PASS';
    case 'fail':
      return 'FAIL';
    case 'current':
      return 'CURRENT';
    case 'pending':
    default:
      return 'PENDING';
  }
}

/**
 * Add a log message to the calibration logs
 */
function addLogMessage(message, type = 'info') {
  if (!elements.calibrationLogs) return;

  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const logClass = type === 'error' ? 'text-red-400' : 'text-green-400';
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${logClass}`;
  logEntry.textContent = `[${timestamp}] ${message}`;

  elements.calibrationLogs.appendChild(logEntry);
  elements.calibrationLogs.scrollTop = elements.calibrationLogs.scrollHeight;
}

/**
 * Cleanup function
 */
function cleanup() {
  calibrationInProgress = false;
  eventListenersSetup = false;

  // Clear any running timers or intervals
  // Reset UI state
  updateCalibrationUI(false);
}

// Export for potential external use
window.gviCleanup = cleanup;
