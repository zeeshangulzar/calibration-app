import * as NotificationHelper from '../../shared/helpers/notification-helper.js';
import { gviCalibrationState } from '../../state/gvi-calibration-state.service.js';

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
  calibrationControlContainer: null,
  gpmAtGaugeContainer: null,
  calibrationButtonsContainer: null,
  calibrationTable: null,
  calibrationLogs: null,
  pageLoader: null,
};

// Calibration data - loaded dynamically from database
const calibrationSteps = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  setupEventListeners();
  await loadAvailableModels();
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

  window.electronAPI.onGVICalibrationCompleted?.(data => {
    addLogMessage('Calibration completed successfully');
    NotificationHelper.showSuccess('Calibration completed successfully');
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

        addLogMessage(`Loaded ${result.models.length} models from database`);
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

  if (btn) {
    btn.disabled = !isValid || calibrationInProgress;
    btn.classList.toggle('opacity-50', !isValid || calibrationInProgress);
    btn.classList.toggle('cursor-not-allowed', !isValid || calibrationInProgress);
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
    const stepsResult = await window.electronAPI.gviGetCalibrationSteps(model);
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
    // Initialize calibration state
    gviCalibrationState.startCalibration(model, tester, serialNumber, steps);
    calibrationInProgress = true;

    // Show loading animation on calibration control container
    showCalibrationLoading();

    addLogMessage(`Starting GVI calibration for model: ${model}`);
    addLogMessage(`Tester: ${tester}, Serial: ${serialNumber}`);

    // Run Fluke prerequisites
    addLogMessage('Running Fluke prerequisites...');
    const prereqsResult = await window.electronAPI.gviRunFlukePrereqs();
    if (!prereqsResult.success) {
      throw new Error(`Fluke prerequisites failed: ${prereqsResult.error}`);
    }

    // Show pressure setting message
    showPressureSettingMessage();

    // Start with first calibration step
    await processNextCalibrationStep();
  } catch (error) {
    console.error('Calibration process error:', error);
    addLogMessage(`Calibration error: ${error.message}`, 'error');
    stopCalibrationProcess();
  }
}

/**
 * Process the next calibration step
 */
async function processNextCalibrationStep() {
  const currentStep = gviCalibrationState.getCurrentStep();
  if (!currentStep) {
    // Calibration complete
    completeCalibration();
    return;
  }

  const pressure = gviCalibrationState.getCurrentPressure();
  addLogMessage(`Step ${gviCalibrationState.currentStepIndex + 1}: Setting pressure to ${pressure} PSI`);

  try {
    // Set pressure using Fluke
    const pressureResult = await window.electronAPI.gviSetPressure(pressure);
    if (!pressureResult.success) {
      throw new Error(`Failed to set pressure: ${pressureResult.error}`);
    }

    // Remove loading animation and show GPM input
    hideCalibrationLoading();
    showGPMInput(currentStep);
  } catch (error) {
    console.error('Error setting pressure:', error);
    addLogMessage(`Error setting pressure: ${error.message}`, 'error');
    stopCalibrationProcess();
  }
}

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
 * Show pressure setting message
 */
function showPressureSettingMessage() {
  const container = elements.gpmAtGaugeContainer;
  if (container) {
    const pressure = gviCalibrationState.getCurrentPressure();
    container.innerHTML = `
      <h4>Setting Pressure to ${pressure} PSI</h4>
      <div class="flex items-end">
        <h1 class="text-4xl font-bold text-blue-600">${pressure}</h1>
        <span class="text-2xl font-bold text-blue-600 ml-2">PSI</span>
      </div>
    `;
  }
}

/**
 * Show GPM input interface
 */
function showGPMInput(step) {
  console.log('showGPMInput called with step:', step);
  const container = elements.gpmAtGaugeContainer;
  const buttonsContainer = elements.calibrationButtonsContainer;

  if (container) {
    container.innerHTML = `
      <h4>Please note GPM at Gauge</h4>
      <div class="flex items-end">
        <h1 class="text-4xl font-bold" id="gpm-at-gauge">${step.gpm}</h1>
        <span class="text-2xl font-bold ml-2">GPM</span>
      </div>
    `;
  }

  if (buttonsContainer) {
    // Check if this is the last step
    const isLastStep = gviCalibrationState.currentStepIndex === gviCalibrationState.calibrationSteps.length - 1;

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

    // Move to next step
    gviCalibrationState.nextStep();

    // Show pressure setting message for next step
    showPressureSettingMessage();
    // Process next calibration step
    await processNextCalibrationStep();
  } catch (error) {
    console.error('Error in next step:', error);
    addLogMessage(`Error in next step: ${error.message}`, 'error');
    stopCalibrationProcess();
  }
}

/**
 * Handle calibration result (PASS/FAIL)
 */
async function handleCalibrationResult(passed) {
  try {
    showCalibrationLoading();

    const result = passed ? 'PASS' : 'FAIL';
    addLogMessage(`Calibration result: ${result}`);

    // Generate PDF
    addLogMessage('Generating calibration PDF...');
    const pdfPath = await generateCalibrationPDF(passed);

    if (pdfPath) {
      addLogMessage(`PDF generated successfully: ${pdfPath}`);

      // Show gauge results with color coding
      showGaugeResults(passed);

      // Show PDF view button
      showPDFViewButton(pdfPath);
      calibrationInProgress = false;
    } else {
      addLogMessage('PDF generation failed', 'error');
      stopCalibrationProcess();
    }
  } catch (error) {
    console.error('Error handling calibration result:', error);
    addLogMessage(`Error handling calibration result: ${error.message}`, 'error');
    stopCalibrationProcess();
  }
}

/**
 * Generate calibration PDF
 */
async function generateCalibrationPDF(passed) {
  try {
    // This would call the main process to generate PDF
    // For now, simulate PDF generation
    const result = await window.electronAPI.gviGeneratePDF({
      model: gviCalibrationState.model,
      tester: gviCalibrationState.tester,
      serialNumber: gviCalibrationState.serialNumber,
      passed: passed,
      steps: gviCalibrationState.calibrationSteps,
      results: gviCalibrationState.testResults,
    });

    if (result.success) {
      return result.pdfPath;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
}

/**
 * Show gauge results with color coding
 */
function showGaugeResults(passed) {
  hideCalibrationLoading();

  const container = elements.gpmAtGaugeContainer;
  const calibrationContainer = elements.calibrationControlContainer;

  if (container) {
    const statusColor = passed ? 'text-green-600' : 'text-red-600';
    const statusText = passed ? 'PASS' : 'FAIL';

    container.innerHTML = `
      <h4>Gauge Results</h4>
      <div class="text-center">
        <h2 class="text-2xl font-bold mb-2">${gviCalibrationState.model}</h2>
        <div class="text-xl">
          Status: <span class="font-bold ${statusColor}">${statusText}</span>
        </div>
      </div>
    `;
  }

  // Update calibration container background color based on result
  if (calibrationContainer) {
    if (passed) {
      calibrationContainer.style.backgroundColor = 'rgba(34, 197, 94, 0.1)'; // Green background
      calibrationContainer.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    } else {
      calibrationContainer.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; // Red background
      calibrationContainer.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    }
  }
}

/**
 * Show PDF view button
 */
function showPDFViewButton(pdfPath) {
  const buttonsContainer = elements.calibrationButtonsContainer;
  if (buttonsContainer) {
    buttonsContainer.innerHTML = `
      <button id="view-pdf-btn" class="border-left-0 rounded-r-md bg-black text-white text-xl font-bold px-4 py-2 hover:bg-gray-800 transition-colors duration-200 w-full">
        VIEW PDF
      </button>
    `;

    // Add event listener for PDF view button
    const viewPdfBtn = document.getElementById('view-pdf-btn');
    viewPdfBtn?.addEventListener('click', () => {
      window.electronAPI.gviOpenPDF(pdfPath);
    });
  }
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
  gviCalibrationState.reset();
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
