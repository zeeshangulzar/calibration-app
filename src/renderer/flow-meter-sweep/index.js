import * as NotificationHelper from '../../shared/helpers/notification-helper.js';

// Application state
let sweepInProgress = false;
let eventListenersSetup = false;
let currentSweepData = null;
let flowMeterModel = null;
let pressureRanges = {
  increasing: [],
  decreasing: [],
};
let currentSweepIndex = 0;
let isIncreasingPhase = true;

// DOM elements cache
const elements = {
  backBtn: null,
  flowMeterSelect: null,
  startSweepBtn: null,
  sweepControlContainer: null,
  psiDisplayContainer: null,
  sweepButtonsContainer: null,
  pressureRangesTable: null,
  sweepLogs: null,
  pageLoader: null,
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  setupEventListeners();
  setupSweepEventListeners();
  await loadAvailableFlowMeters();
  updateStartButtonState();
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
  elements.backBtn = document.getElementById('back-btn');
  elements.flowMeterSelect = document.getElementById('flow-meter-select');
  elements.startSweepBtn = document.getElementById('start-sweep-btn');
  elements.sweepControlContainer = document.getElementById('sweep-control-container');
  elements.psiDisplayContainer = document.getElementById('psi-display-container');
  elements.sweepButtonsContainer = document.getElementById('sweep-control-buttons-container');
  elements.pressureRangesTable = document.getElementById('pressure-ranges-table');
  elements.sweepLogs = document.getElementById('log-messages');
  elements.pageLoader = document.getElementById('page-loader');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  if (eventListenersSetup) return;

  // DOM event listeners
  elements.backBtn?.addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.flowMeterSweepGoBack) {
      if (sweepInProgress) {
        NotificationHelper.showInfo('Stopping sweep and setting Fluke to zero...');
      }
      window.electronAPI.flowMeterSweepGoBack();
    }
  });

  // Form change handlers
  elements.flowMeterSelect?.addEventListener('change', async () => {
    updateStartButtonState();
    await handleFlowMeterChange();
  });

  // Start sweep button
  elements.startSweepBtn?.addEventListener('click', handleStartSweep);

  // Error alert OK button
  document.getElementById('error-ok-btn')?.addEventListener('click', () => {
    document.getElementById('error-alert')?.classList.add('hidden');
  });

  // IPC event listeners
  window.electronAPI.onShowPageLoader?.(() => {
    elements.pageLoader?.classList.remove('hidden');
  });

  window.electronAPI.onHidePageLoader?.(() => {
    elements.pageLoader?.classList.add('hidden');
  });

  // Flow meter sweep specific event listeners
  window.electronAPI.onFlowMeterSweepInitialized?.(() => {
    addLogMessage('Flow meter sweep controller initialized');
  });

  window.electronAPI.onFlowMeterSweepStopped?.(() => {
    sweepInProgress = false;
    addLogMessage('Sweep stopped');
  });

  window.electronAPI.onFlowMeterSweepStepUpdated?.(data => {
    addLogMessage(`Step ${data.stepIndex + 1} completed: ${data.stepData.status.toUpperCase()}`);

    if (data.completed) {
      sweepInProgress = false;
      addLogMessage('All sweep steps completed');
    }
  });

  window.electronAPI.onFlowMeterSweepLogMessage?.(data => {
    addLogMessage(data.message);
  });

  eventListenersSetup = true;
}

/**
 * Setup sweep event listeners for new flow
 */
function setupSweepEventListeners() {
  // Listen for step ready events from sweep service
  window.electronAPI.onFlowMeterSweepStepReady?.(data => {
    addLogMessage(`Step ${data.currentStep}/${data.totalSteps}: Setting pressure to ${data.step.psi} PSI`);

    // Store current step data for pressure setting display
    currentSweepData = data;

    // Remove loading animation and show PSI display
    hideSweepLoading();
    showPSIDisplay(data.step, data.currentStep, data.totalSteps);
  });

  // Listen for sweep started events
  window.electronAPI.onFlowMeterSweepStarted?.(data => {
    addLogMessage(`Sweep started for ${data.model}`);
    sweepInProgress = true;
    updateStartButtonState();
  });

  // Listen for step updated events
  window.electronAPI.onFlowMeterSweepStepUpdated?.(data => {
    addLogMessage(`Step ${data.stepIndex + 1} completed: ${data.stepData.status.toUpperCase()}`);

    if (data.completed) {
      sweepInProgress = false;
      addLogMessage('All sweep steps completed');
    } else {
      // Continue to next step
      addLogMessage('Proceeding to next step...');
    }
  });

  // Listen for sweep completed events
  window.electronAPI.onFlowMeterSweepCompleted?.(data => {
    addLogMessage('Sweep completed successfully');
    NotificationHelper.showSuccess('Sweep completed successfully');
    completeSweep();
  });

  // Listen for sweep failed events
  window.electronAPI.onFlowMeterSweepFailed?.(data => {
    addLogMessage(`Sweep failed: ${data.error}`, 'error');
    NotificationHelper.showError(data.error);
    stopSweepProcess();
    resetSweepUI();
  });
}

/**
 * Load available flow meters from database and populate dropdown
 */
async function loadAvailableFlowMeters() {
  try {
    console.log('Loading flow meters...');
    const result = await window.electronAPI.flowMeterSweepGetAvailableFlowMeters();
    console.log('Flow meters result:', result);

    if (result.success && result.flowMeters) {
      const flowMeterSelect = elements.flowMeterSelect;
      if (flowMeterSelect) {
        // Clear existing options
        flowMeterSelect.innerHTML = '<option value="">Choose Flow Meter</option>';

        // Add flow meters from database
        result.flowMeters.forEach(flowMeter => {
          const option = document.createElement('option');
          option.value = flowMeter.id;
          option.textContent = flowMeter.name;
          flowMeterSelect.appendChild(option);
        });

        updateStartButtonState(); // Update button state after flow meters are loaded
      }
    } else {
      addLogMessage('Failed to load flow meters from database', 'error');
    }
  } catch (error) {
    console.error('Error loading flow meters:', error);
    addLogMessage(`Error loading flow meters: ${error.message}`, 'error');
  }
}

/**
 * Handle flow meter selection change - load pressure ranges for selected flow meter
 */
async function handleFlowMeterChange() {
  const selectedFlowMeterId = elements.flowMeterSelect?.value;
  if (!selectedFlowMeterId) {
    // Clear table when no flow meter selected
    pressureRanges = { increasing: [], decreasing: [] };
    updatePressureRangesTable();
    return;
  }

  try {
    const result = await window.electronAPI.flowMeterSweepGetPressureRanges(selectedFlowMeterId);
    if (result.success && result.pressureRanges) {
      pressureRanges = result.pressureRanges;
      updatePressureRangesTable();
    } else {
      addLogMessage(`Failed to load pressure ranges for selected flow meter`, 'error');
    }
  } catch (error) {
    addLogMessage(`Error loading pressure ranges: ${error.message}`, 'error');
  }
}

/**
 * Update the pressure ranges table with current data
 */
function updatePressureRangesTable() {
  if (!elements.pressureRangesTable) return;

  const tableRows = [];

  // Add increasing pressure ranges
  if (pressureRanges.increasing && pressureRanges.increasing.length > 0) {
    pressureRanges.increasing.forEach((psi, index) => {
      tableRows.push(`
        <tr class="border-b">
          <td class="px-3 py-2 font-medium">Increasing</td>
          <td class="px-3 py-2">${psi} PSI</td>
          <td class="px-3 py-2">
            <span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800" id="inc-status-${index}">Pending</span>
          </td>
        </tr>
      `);
    });
  }

  // Add decreasing pressure ranges
  if (pressureRanges.decreasing && pressureRanges.decreasing.length > 0) {
    pressureRanges.decreasing.forEach((psi, index) => {
      tableRows.push(`
        <tr class="border-b">
          <td class="px-3 py-2 font-medium">Decreasing</td>
          <td class="px-3 py-2">${psi} PSI</td>
          <td class="px-3 py-2">
            <span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800" id="dec-status-${index}">Pending</span>
          </td>
        </tr>
      `);
    });
  }

  elements.pressureRangesTable.innerHTML = tableRows.join('');
}

/**
 * Add a log message to the sweep logs
 */
function addLogMessage(message, type = 'info') {
  if (!elements.sweepLogs) return;

  const newLog = document.createElement('p');
  newLog.className = 'font-mono';
  newLog.textContent = `[${getLocalTimestamp()}] ${message}`;
  elements.sweepLogs.appendChild(newLog);

  // Auto-scroll to bottom
  const scrollContainer = document.getElementById('sweep-log-content');
  if (scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }
}

/**
 * Get local timestamp for log messages
 */
function getLocalTimestamp() {
  return new Date().toLocaleString();
}

/**
 * Validate the form inputs
 */
function validateForm() {
  const flowMeterId = elements.flowMeterSelect?.value;

  return !!flowMeterId;
}

/**
 * Update the start sweep button state based on form validation
 */
function updateStartButtonState() {
  const isValid = validateForm();
  const btn = elements.startSweepBtn;

  console.log('updateStartButtonState - isValid:', isValid, 'sweepInProgress:', sweepInProgress, 'btn:', btn);

  if (btn) {
    btn.disabled = !isValid || sweepInProgress;
    btn.classList.toggle('opacity-50', !isValid || sweepInProgress);
    btn.classList.toggle('cursor-not-allowed', !isValid || sweepInProgress);
    console.log('Button state updated - disabled:', btn.disabled);
  } else {
    console.log('No button found in updateStartButtonState');
  }
}

/**
 * Handle start sweep button click
 */
async function handleStartSweep() {
  if (!validateForm() || sweepInProgress) {
    return;
  }

  try {
    const flowMeterId = elements.flowMeterSelect.value;

    // Get pressure ranges for the selected flow meter
    const rangesResult = await window.electronAPI.flowMeterSweepGetPressureRanges(flowMeterId);
    if (!rangesResult.success) {
      addLogMessage(`Failed to load pressure ranges: ${rangesResult.error}`, 'error');
      return;
    }

    const ranges = rangesResult.pressureRanges;
    console.log('Loaded pressure ranges:', ranges);
    if (!ranges || (!ranges.increasing.length && !ranges.decreasing.length)) {
      addLogMessage('No pressure ranges found for selected flow meter', 'error');
      return;
    }

    // Start sweep process
    await startSweepProcess(flowMeterId, ranges);
  } catch (error) {
    console.error('Error starting sweep:', error);
    addLogMessage(`Error starting sweep: ${error.message}`, 'error');
  }
}

/**
 * Start the sweep process
 */
async function startSweepProcess(flowMeterId, ranges) {
  try {
    // Store sweep data locally
    flowMeterModel = elements.flowMeterSelect.options[elements.flowMeterSelect.selectedIndex].text;
    pressureRanges = ranges;
    sweepInProgress = true;
    currentSweepIndex = 0;
    isIncreasingPhase = true;

    // Show loading animation on sweep control container
    showSweepLoading();

    addLogMessage(`Starting flow meter sweep for: ${flowMeterModel}`);

    // Start sweep using the service
    const config = {
      flowMeterId,
      pressureRanges: ranges,
    };

    const result = await window.electronAPI.flowMeterSweepStartSweep(config);
    if (!result.success) {
      addLogMessage(`Sweep start failed: ${result.error}`, 'error');
      return;
    }
  } catch (error) {
    console.error('Sweep process error:', error);
    addLogMessage(`Sweep error: ${error.message}`, 'error');
    stopSweepProcess();
  }
}

/**
 * Show sweep loading animation
 */
function showSweepLoading() {
  const container = elements.sweepControlContainer;
  if (container) {
    container.classList.add('opacity-70', 'pointer-events-none', 'removing');
    container.style.position = 'relative';
    container.style.transition = 'all 0.3s ease';

    // Add striped loading animation
    container.style.background = 'linear-gradient(45deg, transparent 25%, rgba(59, 130, 246, 0.15) 25%, rgba(59, 130, 246, 0.15) 50%, transparent 50%, transparent 75%, rgba(59, 130, 246, 0.15) 75%)';
    container.style.backgroundSize = '15px 15px';
    container.style.animation = 'removing-stripes 0.8s linear infinite';
    container.style.boxShadow = 'inset 0 0 20px rgba(59, 130, 246, 0.2)';
  }
}

/**
 * Hide sweep loading animation
 */
function hideSweepLoading() {
  const container = elements.sweepControlContainer;
  if (container) {
    container.classList.remove('opacity-70', 'pointer-events-none', 'removing');
    container.style.background = '';
    container.style.backgroundSize = '';
    container.style.animation = '';
    container.style.boxShadow = '';
  }
}

/**
 * Show PSI display interface
 */
function showPSIDisplay(step, currentStep, totalSteps) {
  console.log('showPSIDisplay called with step:', step, 'currentStep:', currentStep, 'totalSteps:', totalSteps);
  const container = elements.psiDisplayContainer;
  const buttonsContainer = elements.sweepButtonsContainer;

  if (container) {
    container.innerHTML = `
      <div class="flex flex-row text-center justify-center">
        <div class="flex items-center">
          <h4>Please note PSI <span id="current-psi-value" class="font-bold text-blue-600">${step.psi}</span></h4>
        </div>
      </div>
    `;
  }

  if (buttonsContainer) {
    // Check if this is the last step
    const isLastStep = currentStep === totalSteps;

    if (isLastStep) {
      // Show COMPLETE button for the last step
      buttonsContainer.innerHTML = `
        <button id="complete-sweep-btn" class="border-left-0 rounded-r-md bg-green-600 w-full text-white text-xl font-bold px-4 py-2 hover:bg-green-700 transition-colors duration-200">
          COMPLETE
        </button>
      `;

      // Add event listener for complete button
      const completeBtn = document.getElementById('complete-sweep-btn');
      completeBtn?.addEventListener('click', handleCompleteSweep);
    } else {
      // Show NEXT button for intermediate steps
      buttonsContainer.innerHTML = `
        <button id="next-step-btn" class="border-left-0 rounded-r-md bg-blue-600 w-full text-white text-xl font-bold px-4 py-2 hover:bg-blue-700 transition-colors duration-200">
          NEXT
        </button>
      `;

      // Add event listener for next button
      const nextBtn = document.getElementById('next-step-btn');
      nextBtn?.addEventListener('click', handleNextStep);
    }
  }

  addLogMessage(`Please note the PSI reading for ${step.psi} PSI`);
}

/**
 * Handle next step button click
 */
async function handleNextStep() {
  try {
    // Show loading animation
    showSweepLoading();

    // Call the next step API
    const result = await window.electronAPI.flowMeterSweepNextStep();
    if (!result.success) {
      throw new Error(result.error);
    }

    if (result.completed) {
      addLogMessage('All sweep steps completed - waiting for completion');
    } else {
      addLogMessage('Proceeding to next step...');
    }
  } catch (error) {
    console.error('Error in next step:', error);
    addLogMessage(`Error in next step: ${error.message}`, 'error');
    stopSweepProcess();
  }
}

/**
 * Handle complete sweep button click
 */
async function handleCompleteSweep() {
  try {
    showSweepLoading();

    addLogMessage('Sweep completed successfully');

    // Send complete result to sweep service
    const result = await window.electronAPI.flowMeterSweepCompleteSweep();
    if (!result.success) {
      throw new Error(`Failed to complete sweep: ${result.error}`);
    }

    addLogMessage(`Sweep completion sent to service`);

    // Show completion UI
    showSweepCompletion();
  } catch (error) {
    console.error('Error completing sweep:', error);
    addLogMessage(`Error completing sweep: ${error.message}`, 'error');
    stopSweepProcess();
  }
}

/**
 * Show sweep completion
 */
function showSweepCompletion() {
  const container = elements.psiDisplayContainer;
  const buttonsContainer = elements.sweepButtonsContainer;

  if (container) {
    container.innerHTML = `
      <div class="text-center">
        <h4 class="text-lg font-medium text-gray-700 mb-2">Sweep Complete</h4>
        <div class="text-xl">
          <span class="font-bold text-green-600">✓ DONE</span>
        </div>
      </div>
    `;
  }

  if (buttonsContainer) {
    buttonsContainer.innerHTML = `
      <button id="restart-sweep-btn" class="border-left-0 rounded-r-md bg-blue-600 w-full text-white text-xl font-bold px-4 py-2 hover:bg-blue-700 transition-colors duration-200">
        RESTART SWEEP
      </button>
    `;

    // Add event listener for restart button
    const restartBtn = document.getElementById('restart-sweep-btn');
    restartBtn?.addEventListener('click', () => {
      resetSweepUI();
    });
  }

  // Hide loading animation
  hideSweepLoading();
}

/**
 * Complete sweep process
 */
function completeSweep() {
  addLogMessage('Flow meter sweep completed successfully!');
  stopSweepProcess();
  showSweepCompletion();
}

/**
 * Reset sweep UI to initial state
 */
function resetSweepUI() {
  // Reset sweep state
  sweepInProgress = false;
  currentSweepIndex = 0;
  isIncreasingPhase = true;

  // Hide loading animation
  hideSweepLoading();

  // Reset sweep container background
  const sweepContainer = elements.sweepControlContainer;
  if (sweepContainer) {
    sweepContainer.style.backgroundColor = '';
    sweepContainer.style.borderColor = '';
  }

  // Reset the PSI display container
  const container = elements.psiDisplayContainer;
  if (container) {
    container.innerHTML = `
      <div class="flex flex-row text-center justify-center">
        <div class="flex items-center">
          <h4>Please note PSI <span id="current-psi-value" class="font-bold text-gray-500">N/A</span></h4>
        </div>
      </div>
    `;
  }

  // Reset sweep buttons
  const buttonsContainer = elements.sweepButtonsContainer;
  if (buttonsContainer) {
    buttonsContainer.innerHTML = `
      <button
        id="start-sweep-btn"
        class="border-left-0 rounded-r-md bg-green-600 w-full text-white text-xl font-bold px-4 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled
      >
        START SWEEP
      </button>
    `;

    // Re-add event listener and update reference
    const startBtn = document.getElementById('start-sweep-btn');
    startBtn?.addEventListener('click', handleStartSweep);

    // Update the elements reference to the new button
    elements.startSweepBtn = startBtn;
  }

  // Reset sweep state
  flowMeterModel = null;
  pressureRanges = { increasing: [], decreasing: [] };

  // Clear current step data
  currentSweepData = null;

  // Update button state to enable it if form is valid
  console.log('resetSweepUI - About to call updateStartButtonState');
  updateStartButtonState();
  console.log('resetSweepUI - updateStartButtonState called');
}

/**
 * Stop sweep process
 */
function stopSweepProcess() {
  sweepInProgress = false;
  flowMeterModel = null;
  pressureRanges = { increasing: [], decreasing: [] };
  currentSweepIndex = 0;
  isIncreasingPhase = true;
  hideSweepLoading();
  updateStartButtonState();

  // Reset sweep container background
  const sweepContainer = elements.sweepControlContainer;
  if (sweepContainer) {
    sweepContainer.style.backgroundColor = '';
    sweepContainer.style.borderColor = '';
  }

  // Reset UI to initial state
  const container = elements.psiDisplayContainer;
  if (container) {
    container.innerHTML = `
      <div class="flex flex-row text-center justify-center">
        <div class="flex items-center">
          <h4>Please note PSI <span id="current-psi-value" class="font-bold text-gray-500">N/A</span></h4>
        </div>
      </div>
    `;
  }

  const buttonsContainer = elements.sweepButtonsContainer;
  if (buttonsContainer) {
    buttonsContainer.innerHTML = `
      <button
        id="start-sweep-btn"
        class="border-left-0 rounded-r-md bg-green-600 w-full text-white text-xl font-bold px-4 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled
      >
        START SWEEP
      </button>
    `;

    // Re-add event listener
    const startBtn = document.getElementById('start-sweep-btn');
    startBtn?.addEventListener('click', handleStartSweep);
  }
}
