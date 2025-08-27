import { getSignalStrengthInfo } from '../../shared/helpers/signal-strength.helper.js';

const renderedDeviceIds = new Set();
const discoveredDevices = [];
let lastSortKey = 'Sensor Id';
const selectedSensorIds = new Set();

const loaderState = {
  isVisible: false,
  hideTimeout: null,
  showTimeout: null,
};

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupSelectAll();
  setupConnectButton();
  setupRefreshButton();
  setupSortDropdown();
  setupSearchInput();
  window.electronAPI.krakenStartScan();
});

function setupNavigation() {
  const backBtn = document.getElementById('back-button-kraken-list');
  backBtn?.addEventListener('click', () => {
    window.electronAPI.cleanupKrakenList();
    window.electronAPI.loadHomeScreen();
  });
  document.getElementById('loader')?.classList.add('hidden');
}

function setupSelectAll() {
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  if (!selectAllCheckbox) return;
  selectAllCheckbox.addEventListener('change', () => {
    const allCheckboxes = document.querySelectorAll('.sensor-checkbox');
    const checked = selectAllCheckbox.checked;
    allCheckboxes.forEach(cb => {
      cb.checked = checked;
      const id = cb.dataset.sensorId;
      checked ? selectedSensorIds.add(id) : selectedSensorIds.delete(id);
    });
    updateConnectButtonState();
  });
  document.querySelectorAll('.sensor-checkbox:checked').forEach(cb => (cb.checked = false));
  renderedDeviceIds.clear();
}

function setupConnectButton() {
  const connectBtn = document.getElementById('connect-sensors-button');
  if (!connectBtn) return;
  connectBtn.addEventListener('click', async () => {
    const selectedSensors = Array.from(document.querySelectorAll('.sensor-checkbox:checked')).map(
      cb => cb.dataset.sensorId
    );
    if (selectedSensors.length > 0) {
      disableRefreshButton();
      await window.electronAPI.krakenConnectDevices(selectedSensors);
    } else {
      showCustomAlertModal('Please select at least one sensor before connecting.');
      enableRefreshButton();
    }
  });
}

function setupRefreshButton() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (!refreshBtn) return;
  refreshBtn.addEventListener('click', async () => {
    clearSensorList();
    await window.electronAPI.krakenRefreshScan();
  });
}

function clearSensorList() {
  const sensorList = document.getElementById('sensor-list');
  while (sensorList.children.length > 1) sensorList.removeChild(sensorList.lastChild);
  renderedDeviceIds.clear();
  discoveredDevices.length = 0;
  selectedSensorIds.clear();
  renderSensorList([]);
}

function setupSortDropdown() {
  const sortDropdown = document.getElementById('sort-list');
  if (!sortDropdown) return;
  sortDropdown.addEventListener('change', () => {
    lastSortKey = sortDropdown.value;
    sortAndRender();
  });
}

function setupSearchInput() {
  const searchInput = document.getElementById('sensor-search');
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    let filtered = discoveredDevices.filter(
      device => device.id.toLowerCase().includes(query) || device.name.toLowerCase().includes(query)
    );
    if (lastSortKey.includes('Sensor Id')) filtered.sort((a, b) => a.id.localeCompare(b.id));
    else if (lastSortKey.includes('Name')) filtered.sort((a, b) => a.name.localeCompare(b.name));
    renderSensorList(filtered);
  });
}

// Device discovery and updates
window.electronAPI.onDeviceDiscovered(device => {
  if (!renderedDeviceIds.has(device.id)) {
    renderedDeviceIds.add(device.id);
    discoveredDevices.push(device);
    sortAndRender();
  }
});

window.electronAPI.onDeviceUpdated(device => {
  const idx = discoveredDevices.findIndex(p => p.id === device.id);
  if (idx !== -1) {
    discoveredDevices[idx] = device;
    const signalData = getSignalStrengthInfo(device.rssi);
    const signalStrength = document.getElementById(`signal-strength-${device.id}`);
    if (signalStrength) signalStrength.innerText = `${signalData.strength} (${device.rssi})`;
    const progressBar = document.getElementById(`signal-progress-bar-${device.id}`);
    if (progressBar) {
      progressBar.style.width = `${signalData.barWidth}%`;
      progressBar.className = `h-2 rounded-full ${signalData.colorClass}`;
    }
  }
});

window.electronAPI.onShowBluetoothError(val => {
  const para = document.getElementById('bluetooth-error');
  para?.classList.toggle('hidden', !val);
});

// Loader state management
window.electronAPI.onShowLoader(() => {
  if (loaderState.hideTimeout) clearTimeout(loaderState.hideTimeout);
  loaderState.hideTimeout = null;
  if (!loaderState.isVisible) {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.remove('hidden');
      loaderState.isVisible = true;
    }
  }
});

window.electronAPI.onHideLoader(() => {
  if (loaderState.showTimeout) clearTimeout(loaderState.showTimeout);
  loaderState.showTimeout = null;
  loaderState.hideTimeout = setTimeout(() => {
    const loader = document.getElementById('loader');
    if (loader && loaderState.isVisible) {
      loader.classList.add('hidden');
      loaderState.isVisible = false;
    }
    loaderState.hideTimeout = null;
  }, 100);
});

// Connection progress and results
window.electronAPI.onDeviceConnectionStarted(data => {
  const loaderText = document.getElementById('loader')?.querySelector('p');
  if (loaderText)
    loaderText.textContent = `Connecting to device ${data.currentIndex}/${data.totalCount}: ${data.deviceName}...`;
  console.log(
    `Starting connection to device ${data.currentIndex}/${data.totalCount}: ${data.deviceName}`
  );
});

window.electronAPI.onDeviceConnectionSuccess(data => {
  console.log(
    `Successfully connected device ${data.currentIndex}/${data.totalCount}. Total connected: ${data.connectedCount}`
  );
});

window.electronAPI.onDeviceConnectionFailed(data => {
  console.log(
    `Failed to connect device ${data.currentIndex}/${data.totalCount} (${data.deviceName}): ${data.error}`
  );
});

window.electronAPI.onDeviceConnectionRetry(data => {
  const loaderText = document.getElementById('loader')?.querySelector('p');
  if (loaderText)
    loaderText.textContent = `Retrying connection (${data.retryAttempt}/${data.maxRetries}): ${data.deviceName}...`;
  console.log(
    `Retrying connection to ${data.deviceName} (${data.retryAttempt}/${data.maxRetries})`
  );
});

window.electronAPI.onShowConnectionErrors(data => {
  let message = `Connection Results: ${data.successful}/${data.totalSelected || data.successful + data.failed.length} devices connected successfully.\n\n`;
  if (data.successful > 0)
    message += `✓ Successfully connected to ${data.successful} device${data.successful !== 1 ? 's' : ''}.\n\n`;
  if (data.failed.length > 0) {
    message += `✗ Failed to connect to ${data.failed.length} device${data.failed.length !== 1 ? 's' : ''}:\n`;
    data.failed.forEach(device => {
      message += `• ${device.name || device.id}: ${device.error}\n`;
    });
  }
  if (data.canProceed) {
    message += `\n\nDo you want to proceed with the ${data.successful} successfully connected device${data.successful !== 1 ? 's' : ''}?`;
    showConnectionResultsModal(message, true);
  } else {
    showCustomAlertModal(message);
  }
});

window.electronAPI.onNavigateToCalibration(data => {
  if (data.connectedDeviceIds && data.connectedDeviceIds.length > 0) {
    if (loaderState.hideTimeout) clearTimeout(loaderState.hideTimeout);
    loaderState.hideTimeout = null;
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('hidden');
      loaderState.isVisible = false;
    }
    console.log(`Navigating to calibration with ${data.connectedDeviceIds.length} devices`);
    setTimeout(() => {
      window.electronAPI.loadKrakenCalibration(data.connectedDeviceIds);
    }, 200);
  }
});

// Connect button cooldown and kraken cleanup
window.electronAPI.onEnableConnectCooldown(data => {
  const connectBtn = document.getElementById('connect-sensors-button');
  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.classList.add('opacity-50', 'cursor-not-allowed');
    const originalHtml = connectBtn.innerHTML;

    if (data?.label) {
      connectBtn.innerHTML = `<i class="fa-solid fa-snowflake mr-2"></i> ${data.label}`;
    }
    setTimeout(() => {
      connectBtn.disabled = false;
      connectBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      connectBtn.innerHTML = originalHtml;
    }, data.cooldownMs);
  }
});

window.electronAPI.onKrakenCleanupStarted(() => {
  console.log('Background kraken cleanup started - disabling connect button');
  const connectBtn = document.getElementById('connect-sensors-button');
  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.classList.add('opacity-50', 'cursor-not-allowed');
    connectBtn.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Cleaning up krakens...';
  }
});

window.electronAPI.onKrakenCleanupCompleted(() => {
  console.log('Background kraken cleanup completed - re-enabling connect button');
  const connectBtn = document.getElementById('connect-sensors-button');
  if (connectBtn) {
    connectBtn.disabled = false;
    connectBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    connectBtn.innerHTML = '<i class="fa-solid fa-upload mr-2"></i> Connect Sensors';
  }
});

// UI helpers
function showCustomAlertModal(message) {
  const alertBox = document.getElementById('custom-alert');
  const alertMessage = document.getElementById('custom-alert-message');
  const alertOkBtn = document.getElementById('custom-alert-ok');
  alertMessage.textContent = message;
  alertBox.classList.remove('hidden');
  alertOkBtn.onclick = () => alertBox.classList.add('hidden');
}

function showConnectionResultsModal(message, canProceed = false) {
  let modal = document.getElementById('connection-results-modal');
  if (!modal) {
    modal = createConnectionResultsModal();
    document.body.appendChild(modal);
  }
  const messageElement = modal.querySelector('#connection-results-message');
  const proceedBtn = modal.querySelector('#proceed-to-calibration-btn');
  const cancelBtn = modal.querySelector('#cancel-connection-btn');
  messageElement.textContent = message;
  proceedBtn.classList.toggle('hidden', !canProceed);
  modal.classList.remove('hidden');
  proceedBtn.onclick = async () => {
    modal.classList.add('hidden');
    try {
      const result = await window.electronAPI.krakenProceedToCalibration();
      if (!result.success)
        showCustomAlertModal(`Failed to proceed to calibration: ${result.error}`);
    } catch (error) {
      showCustomAlertModal(`Error proceeding to calibration: ${error.message}`);
    }
  };
  cancelBtn.onclick = () => modal.classList.add('hidden');
}

function createConnectionResultsModal() {
  const modal = document.createElement('div');
  modal.id = 'connection-results-modal';
  modal.className =
    'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-semibold mb-4">Connection Results</h3>
      <p id="connection-results-message" class="text-sm text-gray-700 mb-6 whitespace-pre-line"></p>
      <div class="flex justify-end space-x-2">
        <button id="cancel-connection-btn" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700">Cancel</button>
        <button id="proceed-to-calibration-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Continue to Calibration</button>
      </div>
    </div>
  `;
  return modal;
}

function sortAndRender() {
  const query = document.getElementById('sensor-search')?.value.trim().toLowerCase();
  let filtered = [...discoveredDevices];
  if (query) {
    filtered = filtered.filter(
      device => device.id.toLowerCase().includes(query) || device.name.toLowerCase().includes(query)
    );
  }
  if (lastSortKey.includes('Sensor Id')) filtered.sort((a, b) => a.id.localeCompare(b.id));
  else if (lastSortKey.includes('Name')) filtered.sort((a, b) => a.name.localeCompare(b.name));
  renderSensorList(filtered);
}

function renderSensorList(devices) {
  const sensorList = document.getElementById('sensor-list');
  while (sensorList.children.length > 1) sensorList.removeChild(sensorList.lastChild);
  devices.forEach(device => {
    const signalData = getSignalStrengthInfo(device.rssi);
    const deviceRow = document.createElement('div');
    deviceRow.className =
      'sensor-item grid grid-cols-12 gap-4 px-6 py-4 border-b border-neutral-100 hover:bg-neutral-50';
    deviceRow.innerHTML = `
      <div class="col-span-1">
       <input type="checkbox" class="sensor-checkbox w-4 h-4" data-sensor-id="${device.id}" ${selectedSensorIds.has(device.id) ? 'checked' : ''}/>
      </div>
      <div class="col-span-3">${device.id}</div>
      <div class="col-span-2">${device.name}</div>
      <div class="col-span-2">
        <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">Discovered</span>
      </div>
      <div class="col-span-2">
        <div class="flex items-center">
          <i class="fa-solid fa-signal text-neutral-700 mr-2"></i>
          <div class="w-24 h-2 bg-neutral-200 rounded-full">
            <div id="signal-progress-bar-${device.id}"></div>
          </div>
          <p id="signal-strength-${device.id}" class="px-3 text-sm">${signalData.strength} (${device.rssi})</p>
        </div>
      </div>
    `;
    sensorList.appendChild(deviceRow);
    const progressBar = document.getElementById(`signal-progress-bar-${device.id}`);
    if (progressBar) {
      progressBar.style.width = `${signalData.barWidth}%`;
      progressBar.className = `h-2 rounded-full ${signalData.colorClass}`;
    }
    const checkbox = deviceRow.querySelector('.sensor-checkbox');
    checkbox.addEventListener('change', e => {
      const id = e.target.dataset.sensorId;
      e.target.checked ? selectedSensorIds.add(id) : selectedSensorIds.delete(id);
      const all = document.querySelectorAll('.sensor-checkbox');
      const selected = document.querySelectorAll('.sensor-checkbox:checked');
      const selectAllCheckbox = document.getElementById('select-all-checkbox');
      if (selectAllCheckbox)
        selectAllCheckbox.checked = all.length > 0 && all.length === selected.length;
      updateConnectButtonState();
    });
  });
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  if (selectAllCheckbox) {
    const checkboxes = document.querySelectorAll('.sensor-checkbox');
    const checked = document.querySelectorAll('.sensor-checkbox:checked');
    selectAllCheckbox.checked = checkboxes.length > 0 && checkboxes.length === checked.length;
  }
}

function updateConnectButtonState() {
  const anyChecked = document.querySelectorAll('.sensor-checkbox:checked').length > 0;
  const connectBtn = document.getElementById('connect-sensors-button');
  connectBtn.disabled = !anyChecked;
  connectBtn.classList.toggle('opacity-50', !anyChecked);
  connectBtn.classList.toggle('cursor-not-allowed', !anyChecked);
}

function disableRefreshButton() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.disabled = true;
}

function enableRefreshButton() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.disabled = false;
    refreshBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }
}
