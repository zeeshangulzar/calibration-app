/**
 * Monster Meter Renderer - Matches previous app exactly
 */
import * as NotificationHelper from '../../shared/helpers/notification-helper.js';
import { MONSTER_METER_CONSTANTS } from '../../config/constants/monster-meter.constants.js';

const getLocalTimestamp = () => new Date().toLocaleTimeString();

// State management
let eventListenersSetup = false;

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

const updateConnectButton = () => {
  const { portSelect, connectPortButton } = elements;
  if (portSelect && connectPortButton) {
    setButtonState(connectPortButton, !portSelect.value);
  }
};

// Main event handlers
const handleConnectPort = async () => {
  const { portSelect, connectPortButton } = elements;
  const selectedPort = portSelect?.value;

  if (!selectedPort) {
    NotificationHelper.showCustomAlertModal('Please select a port first to connect.');
    return;
  }

  try {
    setButtonState(connectPortButton, true, 'Connecting...');
    addLogMessage(`Attempting to connect to ${selectedPort}...`);

    const result = await window.electronAPI.monsterMeterConnectPort(selectedPort);

    if (result.success) {
      addLogMessage(`Successfully connected to ${selectedPort}`);
    } else {
      addLogMessage(`Failed to connect: ${result.error}`, 'error');
      NotificationHelper.showError(`Connection failed: ${result.error}`);
    }
  } catch (error) {
    addLogMessage(`Connection error: ${error.message}`, 'error');
    NotificationHelper.showError(`Connection error: ${error.message}`);
  } finally {
    setButtonState(connectPortButton, false);
    if (connectPortButton) {
      connectPortButton.innerHTML = '<i class="fa-solid fa-upload mr-2"></i> Connect';
    }
  }
};

const cleanupMonsterMeterModule = async () => {
  try {
    console.log('Cleaning up Monster Meter module...');
    cleanupEventListeners();

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
  const { backBtn, portSelect, refreshPortsButton, connectPortButton, errorOkBtn, errorAlert } = elements;

  // Event listeners
  errorOkBtn?.addEventListener('click', () => errorAlert?.classList.add('hidden'));
  backBtn?.addEventListener('click', async () => {
    await cleanupMonsterMeterModule();
    window.electronAPI.monsterMeterGoBack();
  });
  refreshPortsButton?.addEventListener('click', () => window.electronAPI.monsterMeterRefreshPorts());
  portSelect?.addEventListener('change', updateConnectButton);
  connectPortButton?.addEventListener('click', handleConnectPort);

  // Initial button state
  updateConnectButton();
});

// IPC Event Listeners
const ipcHandlers = {
  onMonsterMeterPortsUpdated: ports => {
    const { portSelect } = elements;
    if (!portSelect) return;

    portSelect.innerHTML = '<option value="">Refreshing ports...</option>';

    setTimeout(() => {
      portSelect.innerHTML = '<option value="">Select Port</option>';
      ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.textContent = `${port.path} - ${port.manufacturer || 'Unknown'}`;
        portSelect.appendChild(option);
      });

      if (ports.length > 0) {
        addLogMessage(`Port list updated: ${ports.length} port(s) available`);
      }
      updateConnectButton();
    }, MONSTER_METER_CONSTANTS.UI_UPDATE_DELAY);
  },

  onMonsterMeterConnected: data => {
    addLogMessage('Monster Meter connected successfully');
    NotificationHelper.showSuccess('Monster Meter connected successfully');
  },

  onMonsterMeterDataUpdated: data => {
    showMonsterMeterWidget(data);
    updateLiveData(data.data);
  },

  onMonsterMeterDisconnected: () => {
    hideMonsterMeterWidget();
    addLogMessage('Monster Meter disconnected');
    NotificationHelper.showInfo('Monster Meter disconnected');

    const statusEl = document.getElementById('portStatus');
    if (statusEl) {
      statusEl.textContent = 'Closed';
      statusEl.className = 'px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs';
    }
  },

  onMonsterMeterConnectionError: data => {
    addLogMessage(`Connection error: ${data.error}`, 'error');
    NotificationHelper.showError(`Failed to connect to ${data.port}: ${data.error}`);
  },

  onMonsterMeterError: data => {
    addLogMessage(`Error: ${data.message}`, 'error');
    NotificationHelper.showError(data.message);
  },
};

function setupEventListeners() {
  if (eventListenersSetup) return;

  Object.entries(ipcHandlers).forEach(([event, handler]) => {
    window.electronAPI[event]?.(handler);
  });

  eventListenersSetup = true;
}

function cleanupEventListeners() {
  if (window.electronAPI.removeAllMonsterMeterListeners) {
    window.electronAPI.removeAllMonsterMeterListeners();
  }
  eventListenersSetup = false;
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
      <div>
        <h3>Monster Meter</h3>
        <p class="text-sm text-neutral-600">Name: <span id="nameText">${deviceName}</span></p>
        <p id="portText" class="text-sm text-neutral-600">
          Port: ${deviceInfo.port || 'Unknown'}
          <span id="portStatus" class="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs">Opened</span>
        </p>
      </div>
    </div>
  `;

  grid.appendChild(card);
  addLogMessage(`Monster Meter widget displayed: ${deviceName}`);
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

// Initialize
setupEventListeners();
window.addEventListener('beforeunload', cleanupMonsterMeterModule);
