import * as NotificationHelper from '../../shared/helpers/notification-helper.js';
import { GVI_CONSTANTS } from '../../config/constants/gvi.constants.js';
import { populateSelectOptions } from '../view_helpers/index.js';

// Application state
let calibrationInProgress = false;
let stopRequested = false;
let eventListenersSetup = false;
let currentStepData = null;
let calibrationModel = null;
let calibrationTester = null;
let calibrationSerialNumber = null;
let calibrationSteps = [];

// DOM elements cache
const elements = {
  backBtn: null,
  modelSelect: null,
  testerSelect: null,
  serialNumberInput: null,
  startCalibrationBtn: null,
  stopCalibrationBtn: null,
  calibrationControlContainer: null,
  gpmAtGaugeContainer: null,
  calibrationButtonsContainer: null,
  calibrationTable: null,
  calibrationLogs: null,
  pageLoader: null,
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  setupEventListeners();
  setupCalibrationEventListeners();
  await loadAvailableModels();
  populateTesterDropdown();
  initializeCalibrationTable();
  updateStartButtonState();
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
  elements.stopCalibrationBtn = document.getElementById('stop-calibration-btn');
  elements.calibrationControlContainer = document.getElementById('gvi-calibration-control-container');
  elements.gpmAtGaugeContainer = document.getElementById('gpm-at-gauge-container');
  elements.calibrationButtonsContainer = document.getElementById('gvi-calibration-control-buttons-container');
  elements.calibrationTable = document.getElementById('calibration-table');
  elements.calibrationLogs = document.getElementById('log-messages');
  elements.pageLoader = document.getElementById('page-loader');
}

/**
 * Populate tester dropdown from GVI constants
 */
function populateTesterDropdown() {
  populateSelectOptions('tester-select', GVI_CONSTANTS.TESTER_NAMES, 'Select Tester Name');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  if (eventListenersSetup) return;

  // DOM event listeners
  elements.backBtn?.addEventListener('click', () => {
    // Disable back button during calibration
    if (calibrationInProgress) {
      return;
    }

    // Allow going back when not in calibration
    if (window.electronAPI && window.electronAPI.gviGoBack) {
      window.electronAPI.gviGoBack();
    }
  });

  // Form change handlers
  elements.modelSelect?.addEventListener('change', async () => {
    updateStartButtonState();
    await handleModelChange();
  });

  elements.testerSelect?.addEventListener('change', updateStartButtonState);
  elements.serialNumberInput?.addEventListener('input', updateStartButtonState);

  // Start calibration button
  elements.startCalibrationBtn?.addEventListener('click', handleStartCalibration);

  // Stop calibration button
  elements.stopCalibrationBtn?.addEventListener('click', handleStopCalibration);

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

  // GVI specific event listeners
  window.electronAPI.onGVIInitialized?.(() => {
    addLogMessage('GVI controller initialized');
  });

  window.electronAPI.onGVICalibrationStopped?.(() => {
    calibrationInProgress = false;
  });

  window.electronAPI.onGVIStepUpdated?.(data => {
    addLogMessage(`Step ${data.stepIndex + 1} completed: ${data.stepData.status.toUpperCase()}`);

    if (data.completed) {
      calibrationInProgress = false;
      addLogMessage('All calibration steps completed');
    }
  });

  window.electronAPI.onGVILogMessage?.(data => {
    addLogMessage(data.message);
  });

  eventListenersSetup = true;
}

/**
 * Setup calibration event listeners for new flow
 */
function setupCalibrationEventListeners() {
  // Listen for step ready events from calibration service
  window.electronAPI.onGVIStepReady?.(data => {
    // Check if stop was requested - if so, ignore this step
    if (stopRequested) {
      return;
    }

    addLogMessage(`Step ${data.currentStep}/${data.totalSteps}: ${data.step.gpm} GPM`);
    addLogMessage(`Set pressure to ${data.step.psi || data.step.psiMin || 0} PSI`);

    // Store current step data for pressure setting display
    currentStepData = data;

    // Show pressure setting message and then transition to GPM input
    showPressureSettingMessage(data.step, data.currentStep, data.totalSteps);
  });

  // Listen for step updated events
  window.electronAPI.onGVIStepUpdated?.(data => {
    // Check if stop was requested - if so, ignore this update
    if (stopRequested) {
      return;
    }

    addLogMessage(`Step ${data.stepIndex + 1} completed: ${data.stepData.status.toUpperCase()}`);

    if (data.completed) {
      calibrationInProgress = false;
      addLogMessage('All calibration steps completed');
    } else {
      // Continue to next step
      addLogMessage('Proceeding to next step...');
    }
  });

  // Listen for calibration completed events
  window.electronAPI.onGVICalibrationCompleted?.(data => {
    addLogMessage('Calibration completed successfully');
    NotificationHelper.showSuccess('Calibration completed successfully');
    // Don't call completeCalibration() here - let the user make their PASS/FAIL decision first
  });

  // Listen for calibration failed events
  window.electronAPI.onGVICalibrationFailed?.(data => {
    addLogMessage(`Calibration failed: ${data.error}`, 'error');
    NotificationHelper.showError(data.error);
    stopCalibrationProcess();
    resetCalibrationUI();
  });

  // Fluke connection errors are now handled by the standard calibration failed event
}

/**
 * Load available models from database and populate dropdown
 */
async function loadAvailableModels() {
  try {
    console.log('Loading GVI models...');
    const result = await window.electronAPI.gviGetAvailableModels();
    console.log('GVI models result:', result);

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

        updateStartButtonState(); // Update button state after models are loaded
      }
    } else {
      addLogMessage('Failed to load models from database', 'error');
    }
  } catch (error) {
    console.error('Error loading GVI models:', error);
    addLogMessage(`Error loading models: ${error.message}`, 'error');
  }
}

/**
 * Handle model selection change - load calibration steps for selected model
 */
async function handleModelChange() {
  const selectedModel = elements.modelSelect?.value;
  if (!selectedModel) {
    // Clear table when no model selected
    calibrationSteps.length = 0;
    updateCalibrationTable();
    return;
  }

  try {
    const result = await window.electronAPI.gviGetCalibrationSteps(selectedModel);
    if (result.success && result.steps) {
      calibrationSteps.length = 0;
      calibrationSteps.push(...result.steps);

      updateCalibrationTable();
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

  elements.calibrationTable.innerHTML = calibrationSteps
    .map((step, index) => {
      return `
      <tr id="step-${index}" class="border-b ${step.status === 'current' ? 'bg-blue-50' : ''}">
        <td class="px-3 py-2 font-medium">${step.gpm}</td>
        <td class="px-3 py-2">${parseFloat(step.psiMin).toFixed(2)}</td>
        <td class="px-3 py-2">${parseFloat(step.psiMax).toFixed(2)}</td>
      </tr>
    `;
    })
    .join('');
}

/**
 * Initialize the calibration table (starts empty)
 */
function initializeCalibrationTable() {
  // Table starts empty - will be populated when model is selected
  if (elements.calibrationTable) {
    elements.calibrationTable.innerHTML = '';
  }
}

/**
 * Add a log message to the calibration logs
 */
function addLogMessage(message, type = 'info') {
  if (!elements.calibrationLogs) return;

  const newLog = document.createElement('p');
  newLog.className = 'font-mono';
  newLog.textContent = `[${getLocalTimestamp()}] ${message}`;
  elements.calibrationLogs.appendChild(newLog);

  // Auto-scroll to bottom
  const scrollContainer = document.getElementById('calibration-log-content');
  if (scrollContainer) {
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }
}

/**
 * Get local timestamp for log messages
 */
function getLocalTimestamp() {
  return new Date().toLocaleTimeString();
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
 * Update the start calibration button state based on form validation
 */
function updateStartButtonState() {
  const isValid = validateForm();
  const btn = elements.startCalibrationBtn;
  const buttonsContainer = elements.calibrationButtonsContainer;

  console.log('updateStartButtonState - isValid:', isValid, 'calibrationInProgress:', calibrationInProgress, 'btn:', btn);

  if (btn) {
    btn.disabled = !isValid || calibrationInProgress;
    btn.classList.toggle('opacity-50', !isValid || calibrationInProgress);
    btn.classList.toggle('cursor-not-allowed', !isValid || calibrationInProgress);
    console.log('Button state updated - disabled:', btn.disabled);
  } else {
    console.log('No button found in updateStartButtonState');
  }

  // Handle View PDF button visibility and reset container
  if (buttonsContainer && !calibrationInProgress) {
    const viewPdfBtn = document.getElementById('view-pdf-btn');
    const startBtn = document.getElementById('start-calibration-btn');

    if (viewPdfBtn && startBtn) {
      if (isValid) {
        // Form is valid - show start button, hide view PDF button
        viewPdfBtn.style.display = 'none';
        startBtn.style.display = 'block';

        // Reset the GPM container to original state
        resetGPMContainer();
      } else {
        // Form is not valid - show view PDF button, hide start button
        viewPdfBtn.style.display = 'block';
        startBtn.style.display = 'none';
      }
    }
  }
}

/**
 * Reset GPM container to original state
 */
function resetGPMContainer() {
  const container = elements.gpmAtGaugeContainer;
  if (container) {
    container.innerHTML = `
      <div class="flex flex-row text-center justify-center">
        <div class="flex items-center">
          <h4>Please note this GPM at Gauge</h4>
        </div>
        <div class="ml-5 flex">
          <h1 class="text-4xl font-bold" id="gpm-at-gauge">N/A</h1>
          <span class="text-4xl font-bold ml-2">GPM</span>
        </div>
      </div>
    `;
  }
}

/**
 * Clear all calibration logs
 */
function clearCalibrationLogs() {
  const logsContainer = elements.calibrationLogs;
  if (logsContainer) {
    logsContainer.innerHTML = '';
  }
}

/**
 * Disable form elements during calibration
 */
function disableFormElements() {
  // Disable back button
  if (elements.backBtn) {
    disableElement(elements.backBtn);
  }

  // Show back button status message
  const statusMessage = document.getElementById('back-button-status-message');
  const messageText = document.getElementById('back-button-message-text');

  if (statusMessage && messageText) {
    messageText.textContent = 'Back button is disabled during calibration. It will be re-enabled when calibration completes or if an error occurs.';
    statusMessage.classList.remove('hidden');
  }

  // Disable form inputs
  if (elements.modelSelect) {
    disableElement(elements.modelSelect);
  }

  if (elements.testerSelect) {
    disableElement(elements.testerSelect);
  }

  if (elements.serialNumberInput) {
    disableElement(elements.serialNumberInput);
  }
}

/**
 * Enable form elements after calibration
 */
function enableFormElements() {
  // Enable back button
  if (elements.backBtn) {
    enableElement(elements.backBtn);
  }

  // Hide back button status message
  const statusMessage = document.getElementById('back-button-status-message');
  if (statusMessage) {
    statusMessage.classList.add('hidden');
  }

  // Enable form inputs
  if (elements.modelSelect) {
    enableElement(elements.modelSelect);
  }

  if (elements.testerSelect) {
    enableElement(elements.testerSelect);
  }

  if (elements.serialNumberInput) {
    enableElement(elements.serialNumberInput);
  }
}

function enableElement(inputElement) {
  inputElement.disabled = false;
  inputElement.classList.remove('opacity-50', 'cursor-not-allowed');
}

function disableElement(inputElement) {
  if (!inputElement) return;
  inputElement.disabled = true;
  inputElement.classList.add('opacity-50', 'cursor-not-allowed');
}

function hideElement(element) {
  if (!element) return;
  element.classList.add('hidden');
}

function showElement(element) {
  if (!element) return;
  element.classList.remove('hidden');
}

/**
 * Handle start calibration button click
 */
async function handleStartCalibration() {
  if (!validateForm() || calibrationInProgress) {
    return;
  }

  try {
    const model = elements.modelSelect.value;
    const tester = elements.testerSelect.value;
    const serialNumber = elements.serialNumberInput.value.trim();

    // Get calibration steps for the selected model
    const stepsResult = await window.electronAPI.gviGetCalibrationSteps(model); //rename variable name
    if (!stepsResult.success) {
      addLogMessage(`Failed to load calibration steps: ${stepsResult.error}`, 'error');
      return;
    }

    const steps = stepsResult.steps;
    console.log('Loaded calibration steps:', steps);
    if (!steps || steps.length === 0) {
      addLogMessage('No calibration steps found for selected model', 'error');
      return;
    }

    // Start calibration process
    await startCalibrationProcess(model, tester, serialNumber, steps);
  } catch (error) {
    console.error('Error starting calibration:', error);
    addLogMessage(`Error starting calibration: ${error.message}`, 'error');
  }
}

/**
 * Handle stop calibration button click
 */
async function handleStopCalibration() {
  if (!calibrationInProgress) {
    return;
  }

  try {
    addLogMessage('Stopping calibration...');

    // Immediately reset the UI state to prevent any step processing
    calibrationInProgress = false;
    stopRequested = true;

    // Hide any step-related UI elements immediately
    hideCalibrationLoading();

    // Reset the GPM input container to initial state
    const container = elements.gpmAtGaugeContainer;
    if (container) {
      container.innerHTML = `
        <div class="flex flex-row text-center justify-center">
          <div class="flex items-center">
            <h4>Please note this GPM at Gauge</h4>
          </div>
          <div class="ml-5 flex">
            <h1 class="text-4xl font-bold" id="gpm-at-gauge">N/A</h1>
            <span class="text-4xl font-bold ml-2">GPM</span>
          </div>
        </div>
      `;
    }

    // Reset calibration buttons to initial state
    const buttonsContainer = elements.calibrationButtonsContainer;
    if (buttonsContainer) {
      buttonsContainer.innerHTML = `
        <button
          id="start-calibration-btn"
          class="border-left-0 rounded-r-md bg-green-600 w-full text-white text-xl font-bold px-4 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled
        >
          START CALIBRATION
        </button>
      `;

      // Re-add event listener
      const startBtn = document.getElementById('start-calibration-btn');
      startBtn?.addEventListener('click', handleStartCalibration);
      elements.startCalibrationBtn = startBtn;
    }

    // Call the stop calibration API
    const result = await window.electronAPI.gviStopCalibration();
    if (!result.success) {
      addLogMessage(`Failed to stop calibration: ${result.error}`, 'error');
    } else {
      addLogMessage('Calibration stopped successfully');
      NotificationHelper.showInfo('Calibration stopped.');
    }

    // Complete the UI reset
    stopCalibrationProcess();
  } catch (error) {
    console.error('Error stopping calibration:', error);
    addLogMessage(`Error stopping calibration: ${error.message}`, 'error');
    // Still reset the UI even if there was an error
    stopCalibrationProcess();
  }
}

/**
 * Start the calibration process
 */
async function startCalibrationProcess(model, tester, serialNumber, steps) {
  try {
    // Clear all logs as first step
    clearCalibrationLogs();

    // Store calibration data locally
    calibrationModel = model;
    calibrationTester = tester;
    calibrationSerialNumber = serialNumber;
    calibrationSteps = [...steps];
    calibrationInProgress = true;
    stopRequested = false;

    // Disable form elements during calibration
    disableFormElements();

    // Show stop button and hide start button
    hideElement(elements.startCalibrationBtn);
    showElement(elements.stopCalibrationBtn);

    // Show loading animation on calibration control container
    showCalibrationLoading();

    addLogMessage(`Starting GVI calibration for model: ${model}`);
    addLogMessage(`Tester: ${tester}, Serial: ${serialNumber}`);

    // Start calibration using the service (handles Fluke prerequisites and all steps)
    const config = {
      model,
      tester,
      serialNumber,
      steps,
    };

    const result = await window.electronAPI.gviStartCalibration(config);
    if (!result.success) {
      // Don't throw error here - let the calibration failed event handler show the proper modal
      return;
    }
  } catch (error) {
    console.error('Calibration process error:', error);
    addLogMessage(`Calibration error: ${error.message}`, 'error');
    stopCalibrationProcess();
  }
}

// processNextCalibrationStep removed - now handled by calibration service

/**
 * Show calibration loading animation (same as Kraken remove animation)
 */
function showCalibrationLoading() {
  const container = elements.calibrationControlContainer;
  if (container) {
    container.classList.add('opacity-70', 'pointer-events-none', 'removing');
    container.style.position = 'relative';
    container.style.transition = 'all 0.3s ease';

    // Add striped loading animation (more prominent)
    container.style.background = 'linear-gradient(45deg, transparent 25%, rgba(59, 130, 246, 0.15) 25%, rgba(59, 130, 246, 0.15) 50%, transparent 50%, transparent 75%, rgba(59, 130, 246, 0.15) 75%)';
    container.style.backgroundSize = '15px 15px';
    container.style.animation = 'removing-stripes 0.8s linear infinite';
    container.style.boxShadow = 'inset 0 0 20px rgba(59, 130, 246, 0.2)';
  }
}

/**
 * Show pressure setting message and transition to GPM input
 */
function showPressureSettingMessage(step, currentStep, totalSteps) {
  const PRESSURE_MESSAGE_DELAY = 1000; // 1 second delay to show the message

  // Show "Setting pressure to" message in GPM container
  const gpmContainer = elements.gpmAtGaugeContainer;
  if (gpmContainer) {
    const pressure = (step.psi ? step.psi.toFixed(2) : null) || (step.psiMin ? step.psiMin.toFixed(2) : null) || 0;
    gpmContainer.innerHTML = `
      <div class="flex flex-row text-center justify-center">
        <div class="flex items-center">
          <h4>Setting pressure to ${pressure} PSI</h4>
        </div>
        <div class="ml-5 flex">
          <h1 class="text-4xl font-bold" id="gpm-at-gauge">Please wait...</h1>
        </div>
      </div>
    `;
  }

  // Transition to GPM input after delay
  setTimeout(() => {
    if (!stopRequested) {
      hideCalibrationLoading();
      showGPMInput(step, currentStep, totalSteps);
    }
  }, PRESSURE_MESSAGE_DELAY);
}

/**
 * Hide calibration loading animation
 */
function hideCalibrationLoading() {
  const container = elements.calibrationControlContainer;
  if (container) {
    container.classList.remove('opacity-70', 'pointer-events-none', 'removing');
    container.style.background = '';
    container.style.backgroundSize = '';
    container.style.animation = '';
    container.style.boxShadow = '';
  }
}

/**
 * Show pressure setting display while processing next step
 */
function showPressureSettingDisplay() {
  const container = elements.gpmAtGaugeContainer;
  if (container) {
    // Get pressure from the next step (current step + 1)
    const currentStepIndex = currentStepData?.currentStep || 0;
    const nextStepIndex = currentStepIndex; // The next step is at the current step index
    const nextStep = calibrationSteps?.[nextStepIndex];
    const pressure = nextStep?.psi || nextStep?.psiMin || 0;

    console.log(`[Pressure Display] Current step: ${currentStepIndex}, Next step index: ${nextStepIndex}, Pressure: ${pressure}`);

    container.innerHTML = `
      <div class="flex flex-row text-center justify-center">
        <div class="flex items-center">
          <h4>Setting pressure to ${pressure.toFixed(2)} PSI</h4>
        </div>
        <div class="ml-5 flex">
          <h1 class="text-4xl font-bold" id="gpm-at-gauge">Please wait...</h1>
        </div>
      </div>
    `;
  }
}

/**
 * Show GPM input interface
 */
function showGPMInput(step, currentStep, totalSteps) {
  console.log('showGPMInput called with step:', step, 'currentStep:', currentStep, 'totalSteps:', totalSteps);
  const container = elements.gpmAtGaugeContainer;
  const buttonsContainer = elements.calibrationButtonsContainer;

  if (container) {
    container.innerHTML = `
    <div class="flex flex-row text-center justify-center">
      <div class="flex items-center">
        <h4>Please note this GPM at Gauge</h4>
      </div>
      <div class="ml-5 flex">
        <h1 class="text-4xl font-bold" id="gpm-at-gauge">${step.gpm}</h1>
        <span class="text-4xl font-bold ml-2">GPM</span>
      </div>
    </div>
    `;
  }

  if (buttonsContainer) {
    // Check if this is the last step
    const isLastStep = currentStep === totalSteps;

    if (isLastStep) {
      // Show PASS/FAIL buttons for the last step
      buttonsContainer.innerHTML = `
        <button id="pass-btn" class="border-left-0 rounded-l-md bg-green-600 text-white text-xl font-bold px-4 py-2 hover:bg-green-700 transition-colors duration-200" style="width: 70%;">
          PASS
        </button>
        <button id="fail-btn" class="border-left-0 rounded-r-md bg-red-600 text-white text-xl font-bold px-4 py-2 hover:bg-red-700 transition-colors duration-200" style="width: 30%;">
          FAIL
        </button>
      `;

      // Add event listeners for pass/fail buttons
      const passBtn = document.getElementById('pass-btn');
      const failBtn = document.getElementById('fail-btn');

      passBtn?.addEventListener('click', () => handleCalibrationResult(true));
      failBtn?.addEventListener('click', () => {
        // Add custom confirmation modal for FAIL
        NotificationHelper.showConfirmationModal(
          'Are you sure you want to mark this calibration as FAIL?',
          () => {
            // User confirmed - proceed with FAIL
            handleCalibrationResult(false);
          },
          () => {
            // User cancelled - do nothing
          }
        );
      });
    } else {
      // Show NEXT button for intermediate steps
      buttonsContainer.innerHTML = `
        <button id="next-step-btn" class="border-left-0 rounded-r-md bg-black w-full text-white text-xl font-bold px-4 py-2 hover:bg-gray-800 transition-colors duration-200">
          NEXT
        </button>
      `;

      // Add event listener for next button
      const nextBtn = document.getElementById('next-step-btn');
      nextBtn?.addEventListener('click', handleNextStep);
    }
  }

  addLogMessage(`Please note the GPM reading for ${step.gpm} GPM at ${step.psiMin} PSI`);
}

/**
 * Handle next step button click
 */
async function handleNextStep() {
  try {
    // Show loading animation
    showCalibrationLoading();

    // Show pressure setting display while processing
    showPressureSettingDisplay();

    // Call the next step API
    const result = await window.electronAPI.gviNextStep();
    if (!result.success) {
      throw new Error(result.error);
    }

    if (result.completed) {
      addLogMessage('All calibration steps completed - waiting for final result');
      // Don't complete yet - wait for user to provide final PASS/FAIL result
    } else {
      addLogMessage('Proceeding to next step...');
    }
  } catch (error) {
    console.error('Error in next step:', error);
    addLogMessage(`Error in next step: ${error.message}`, 'error');
    stopCalibrationProcess();
  }
}

/**
 * Handle calibration result (PASS/FAIL) - final result for entire calibration
 */
async function handleCalibrationResult(passed) {
  try {
    showCalibrationLoading();

    const result = passed ? 'PASS' : 'FAIL';
    addLogMessage(`Final calibration result: ${result}`);

    // Send final result to calibration service
    const result_response = await window.electronAPI.gviHandleFinalResult(passed);
    if (!result_response.success) {
      throw new Error(`Failed to handle final result: ${result_response.error}`);
    }

    addLogMessage(`Final result sent to calibration service`);

    // Complete the calibration process (don't show start button)
    completeCalibrationProcess();

    // Generate PDF and show View PDF button
    const pdfResult = await generateCalibrationPDF(passed);

    // Show completion UI with View PDF button
    showCalibrationCompletion(passed, pdfResult);
  } catch (error) {
    console.error('Error handling final calibration result:', error);
    addLogMessage(`Error handling final calibration result: ${error.message}`, 'error');
    stopCalibrationProcess();
  }
}

/**
 * Show calibration completion with View PDF button
 */
function showCalibrationCompletion(passed, pdfResult = null) {
  const container = elements.gpmAtGaugeContainer;
  const buttonsContainer = elements.calibrationButtonsContainer;

  if (container) {
    const statusColor = passed ? 'text-green-600' : 'text-red-600';
    const statusText = passed ? 'PASS' : 'FAIL';

    // Get model from form, local state, or PDF result
    const model = elements.modelSelect?.value || calibrationModel || pdfResult?.model || 'Unknown';

    container.innerHTML = `
      <div class="flex flex-row text-center justify-center">
        <div class="flex items-center">
          <h4>Calibration Complete - ${model}</h4>
        </div>
        <div class="ml-5 flex">
          <h1 class="text-4xl font-bold ${statusColor}">${statusText}</h1>
        </div>
      </div>
    `;
  }

  if (buttonsContainer) {
    buttonsContainer.innerHTML = `
      <button id="view-pdf-btn" class="border-left-0 rounded-r-md bg-black w-full text-white text-xl font-bold px-4 py-2 hover:bg-gray-800 transition-colors duration-200" style="display: block;">
        VIEW PDF
      </button>
      <button id="start-calibration-btn" class="border-left-0 rounded-r-md bg-green-600 w-full text-white text-xl font-bold px-4 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed" style="display: none;" disabled>
        START CALIBRATION
      </button>
    `;

    // Add event listener for view PDF button
    const viewPdfBtn = document.getElementById('view-pdf-btn');
    viewPdfBtn?.addEventListener('click', async () => {
      try {
        const pdfPath = pdfResult?.pdfPath;
        if (pdfPath) {
          await window.electronAPI.gviOpenPDF(pdfPath);
        } else {
          addLogMessage('PDF path not found', 'error');
        }
      } catch (error) {
        console.error('Error opening PDF:', error);
        addLogMessage(`Error opening PDF: ${error.message}`, 'error');
      }
    });

    // Add event listener for start calibration button
    const startBtn = document.getElementById('start-calibration-btn');
    startBtn?.addEventListener('click', handleStartCalibration);

    // Update element references
    elements.startCalibrationBtn = startBtn;
  }

  // Hide loading animation
  hideCalibrationLoading();

  // Update button state to show View PDF button initially
  updateStartButtonState();
}

/**
 * Generate calibration PDF
 */
async function generateCalibrationPDF(passed) {
  try {
    // Get the calibration data from the form and local state
    const calibrationData = {
      model: elements.modelSelect?.value || calibrationModel || 'Unknown',
      tester: elements.testerSelect?.value || calibrationTester || 'Unknown',
      serialNumber: elements.serialNumberInput?.value || calibrationSerialNumber || 'Unknown',
      passed: passed,
      steps: calibrationSteps || [],
      results: [], // GVI doesn't track individual step results
    };

    const result = await window.electronAPI.gviGeneratePDF(calibrationData);

    if (result.success) {
      return result; // Return the full result object
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    addLogMessage(`PDF generation failed: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Reset calibration UI to initial state
 */
function resetCalibrationUI() {
  // Reset calibration state
  calibrationInProgress = false;
  stopRequested = false;

  // Enable form elements
  enableFormElements();

  // Clear form selections
  clearCalibrationInputs();

  // Hide loading animation
  hideCalibrationLoading();

  // Reset calibration container background
  const calibrationContainer = elements.calibrationControlContainer;
  if (calibrationContainer) {
    calibrationContainer.style.backgroundColor = '';
    calibrationContainer.style.borderColor = '';
  }

  // Reset the GPM input container
  const container = elements.gpmAtGaugeContainer;
  if (container) {
    container.innerHTML = `
      <h4>Please Note GPM at Gauge</h4>
      <div class="flex items-end">
        <h1 class="text-4xl font-bold" id="gpm-at-gauge">N/A</h1>
        <span class="text-2xl font-bold ml-2">GPM</span>
      </div>
    `;
  }

  // Reset calibration buttons
  const buttonsContainer = elements.calibrationButtonsContainer;
  if (buttonsContainer) {
    buttonsContainer.innerHTML = `
      <button
        id="start-calibration-btn"
        class="border-left-0 rounded-r-md bg-green-600 w-full text-white text-xl font-bold px-4 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled
      >
        START CALIBRATION
      </button>
    `;

    // Re-add event listener and update reference
    const startBtn = document.getElementById('start-calibration-btn');
    startBtn?.addEventListener('click', handleStartCalibration);

    // Update the elements reference to the new button
    elements.startCalibrationBtn = startBtn;
  }

  // Hide stop button (it's now a separate element)
  hideElement(elements.stopCalibrationBtn);

  // Reset calibration state
  calibrationModel = null;
  calibrationTester = null;
  calibrationSerialNumber = null;
  calibrationSteps = [];

  // Clear current step data
  currentStepData = null;

  // Update button state to enable it if form is valid
  console.log('resetCalibrationUI - About to call updateStartButtonState');
  updateStartButtonState();
  console.log('resetCalibrationUI - updateStartButtonState called');
}

function clearCalibrationInputs() {
  if (elements.modelSelect) {
    elements.modelSelect.value = '';
  }
  if (elements.serialNumberInput) {
    elements.serialNumberInput.value = '';
  }
}

/**
 * Stop calibration process
 */
function stopCalibrationProcess() {
  calibrationInProgress = false;
  stopRequested = false;
  // Don't clear model data here - preserve it for completion display

  // Show start button and hide stop button
  showElement(elements.startCalibrationBtn);
  hideElement(elements.stopCalibrationBtn);

  // Enable form elements
  enableFormElements();

  // Clear form selections
  clearCalibrationInputs();

  hideCalibrationLoading();
  updateStartButtonState();
}

/**
 * Complete calibration process (for normal completion flow)
 */
function completeCalibrationProcess() {
  calibrationInProgress = false;
  stopRequested = false;
  // Don't clear model data here - preserve it for completion display

  // Hide stop button (don't show start button yet)
  hideElement(elements.stopCalibrationBtn);

  // Enable form elements
  enableFormElements();

  // Clear form selections
  clearCalibrationInputs();

  hideCalibrationLoading();
}

/**
 * Clear calibration data (called after completion)
 */
function clearCalibrationData() {
  calibrationModel = null;
  calibrationTester = null;
  calibrationSerialNumber = null;
  calibrationSteps = [];

  // Reset calibration container background
  const calibrationContainer = elements.calibrationControlContainer;
  if (calibrationContainer) {
    calibrationContainer.style.backgroundColor = '';
    calibrationContainer.style.borderColor = '';
  }

  // Reset UI to initial state
  const container = elements.gpmAtGaugeContainer;
  if (container) {
    container.innerHTML = `
      <h4>Please Note GPM at Gauge</h4>
      <div class="flex items-end">
        <h1 class="text-4xl font-bold" id="gpm-at-gauge">N/A</h1>
        <span class="text-2xl font-bold ml-2">GPM</span>
      </div>
    `;
  }

  const buttonsContainer = elements.calibrationButtonsContainer;
  if (buttonsContainer) {
    buttonsContainer.innerHTML = `
      <button
        id="start-calibration-btn"
        class="border-left-0 rounded-r-md bg-green-600 w-full text-white text-xl font-bold px-4 py-2 hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled
      >
        START CALIBRATION
      </button>
    `;

    // Re-add event listener
    const startBtn = document.getElementById('start-calibration-btn');
    startBtn?.addEventListener('click', handleStartCalibration);

    // Update element reference
    elements.startCalibrationBtn = startBtn;
  }
}
