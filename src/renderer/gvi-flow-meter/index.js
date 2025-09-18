import * as NotificationHelper from '../../shared/helpers/notification-helper.js';
import { GVI_CONSTANTS } from '../../config/constants/gvi.constants.js';
import { populateSelectOptions } from '../view_helpers/index.js';

// Application state
let calibrationInProgress = false;
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
  populateSelectOptions('tester-select', GVI_CONSTANTS.TESTER_NAMES, 'Select Tester');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  if (eventListenersSetup) return;

  // DOM event listeners
  elements.backBtn?.addEventListener('click', () => {
    // Allow going back during calibration - controller will handle stopping calibration and setting Fluke to zero
    if (window.electronAPI && window.electronAPI.gviGoBack) {
      if (calibrationInProgress) {
        NotificationHelper.showInfo('Stopping calibration and setting Fluke to zero...');
      }
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
    addLogMessage('Calibration stopped');
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
    addLogMessage(`Step ${data.currentStep}/${data.totalSteps}: ${data.step.gpm} GPM`);
    addLogMessage(`Set pressure to ${data.step.psi || data.step.psiMin || 0} PSI`);

    // Store current step data for pressure setting display
    currentStepData = data;

    // Remove loading animation and show GPM input
    hideCalibrationLoading();
    showGPMInput(data.step, data.currentStep, data.totalSteps);
  });

  // Listen for calibration started events

  // Listen for step updated events
  window.electronAPI.onGVIStepUpdated?.(data => {
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
    completeCalibration();
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
        <td class="px-3 py-2">${step.psiMin}</td>
        <td class="px-3 py-2">${step.psiMax}</td>
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
  return new Date().toLocaleString();
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

  console.log('updateStartButtonState - isValid:', isValid, 'calibrationInProgress:', calibrationInProgress, 'btn:', btn);

  if (btn) {
    btn.disabled = !isValid || calibrationInProgress;
    btn.classList.toggle('opacity-50', !isValid || calibrationInProgress);
    btn.classList.toggle('cursor-not-allowed', !isValid || calibrationInProgress);
    console.log('Button state updated - disabled:', btn.disabled);
  } else {
    console.log('No button found in updateStartButtonState');
  }
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
 * Start the calibration process
 */
async function startCalibrationProcess(model, tester, serialNumber, steps) {
  try {
    // Store calibration data locally
    calibrationModel = model;
    calibrationTester = tester;
    calibrationSerialNumber = serialNumber;
    calibrationSteps = [...steps];
    calibrationInProgress = true;

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
      addLogMessage(`Calibration start failed: ${result.error}`, 'error');
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
      <div class="text-center">
        <h4 class="text-lg font-medium text-gray-700 mb-4">Setting Pressure to ${pressure} PSI</h4>
        <div class="flex justify-center items-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span class="ml-3 text-gray-600">Please wait...</span>
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
      failBtn?.addEventListener('click', () => handleCalibrationResult(false));
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
      <h4>Calibration Complete</h4>
      <div class="text-center">
        <h2 class="text-2xl font-bold mb-2">${model}</h2>
        <div class="text-xl">
          Status: <span class="font-bold ${statusColor}">${statusText}</span>
        </div>
      </div>
    `;
  }

  if (buttonsContainer) {
    buttonsContainer.innerHTML = `
      <button id="view-pdf-btn" class="border-left-0 rounded-r-md bg-black w-full text-white text-xl font-bold px-4 py-2 hover:bg-gray-800 transition-colors duration-200">
        VIEW PDF
      </button>
    `;

    // Add event listener for view PDF button
    const viewPdfBtn = document.getElementById('view-pdf-btn');
    viewPdfBtn?.addEventListener('click', async () => {
      try {
        addLogMessage('Opening PDF...');
        // Get the PDF path from the PDF result
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
  }

  // Hide loading animation
  hideCalibrationLoading();
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

    addLogMessage('Generating calibration PDF...');

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

// Fluke connection error modal removed - now using standard NotificationHelper.showError()

/**
 * Reset calibration UI to initial state
 */
function resetCalibrationUI() {
  // Reset calibration state
  calibrationInProgress = false;

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

/**
 * Complete calibration process
 */
function completeCalibration() {
  addLogMessage('GVI calibration completed successfully!');
  stopCalibrationProcess();

  // Show completion message
  const container = elements.gpmAtGaugeContainer;
  if (container) {
    container.innerHTML = `
      <h4>Calibration Complete</h4>
      <div class="flex items-end">
        <h1 class="text-4xl font-bold text-green-600">✓</h1>
        <span class="text-2xl font-bold text-green-600 ml-2">DONE</span>
      </div>
    `;
  }
}

/**
 * Stop calibration process
 */
function stopCalibrationProcess() {
  calibrationInProgress = false;
  calibrationModel = null;
  calibrationTester = null;
  calibrationSerialNumber = null;
  calibrationSteps = [];
  hideCalibrationLoading();
  updateStartButtonState();

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
  }
}
