/**
 * Kraken Device List Page Script
 * Handles device discovery, selection, and connection
 */

// State management
let discoveredDevices = new Map();
let selectedDevices = new Set();
let isScanning = false;
let sortBy = 'id';

// DOM Elements
let elements = {};

document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  setupEventListeners();
  initializeKrakenService();
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
  elements = {
    loader: document.getElementById('loader'),
    bluetoothError: document.getElementById('bluetooth-error'),
    serviceError: document.getElementById('service-error'),
    serviceErrorMessage: document.getElementById('service-error-message'),
    sensorSearch: document.getElementById('sensor-search'),
    sortDropdown: document.getElementById('sort-dropdown'),
    selectAll: document.getElementById('select-all'),
    sensorList: document.getElementById('sensor-list'),
    emptyState: document.getElementById('empty-state'),
    deviceCount: document.getElementById('device-count'),
    selectedCount: document.getElementById('selected-count'),
    connectSelected: document.getElementById('connect-selected'),
    refreshBtn: document.getElementById('refreshBtn'),
    backButton: document.getElementById('back-button'),
    connectionModal: document.getElementById('connection-modal'),
    connectionResults: document.getElementById('connection-results'),
    modalCancel: document.getElementById('modal-cancel'),
    modalContinue: document.getElementById('modal-continue'),
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
    window.electronAPI.send('kraken:go-home');
  });

  // Refresh button
  elements.refreshBtn.addEventListener('click', () => {
    refreshDeviceDiscovery();
  });

  // Search and sort
  elements.sensorSearch.addEventListener('input', handleSearch);
  elements.sortDropdown.addEventListener('change', handleSortChange);

  // Select all checkbox
  elements.selectAll.addEventListener('change', handleSelectAll);

  // Connect selected button
  elements.connectSelected.addEventListener('click', handleConnectSelected);

  // Modal handlers
  elements.modalCancel.addEventListener('click', closeConnectionModal);
  elements.modalContinue.addEventListener('click', proceedToCalibration);
  elements.alertOk.addEventListener('click', closeAlertModal);

  // Kraken service event listeners
  setupKrakenEventListeners();
}

/**
 * Setup Kraken service event listeners
 */
function setupKrakenEventListeners() {
  // Service events
  window.electronAPI.on('kraken:service-initialized', () => {
    console.log('Kraken service initialized');
    startDeviceDiscovery();
  });

  window.electronAPI.on('kraken:service-error', (error) => {
    showServiceError(error.error);
  });

  // Bluetooth events
  window.electronAPI.on('kraken:bluetooth-ready', () => {
    hideBluetoothError();
  });

  window.electronAPI.on('kraken:bluetooth-error', (state) => {
    showBluetoothError();
  });

  // Discovery events
  window.electronAPI.on('kraken:device-discovered', (device) => {
    handleDeviceDiscovered(device);
  });

  window.electronAPI.on('kraken:discovery-started', () => {
    isScanning = true;
    updateUI();
  });

  window.electronAPI.on('kraken:discovery-stopped', () => {
    isScanning = false;
    updateUI();
  });

  // Connection events
  window.electronAPI.on('kraken:connection-started', () => {
    showLoader('Connecting to selected devices...');
  });

  window.electronAPI.on('kraken:connection-completed', (data) => {
    hideLoader();
    handleConnectionCompleted(data);
  });

  window.electronAPI.on('kraken:connection-partially-failed', (data) => {
    hideLoader();
    handleConnectionPartiallyFailed(data);
  });

  window.electronAPI.on('kraken:connection-failed', (data) => {
    hideLoader();
    showAlert('error', 'Connection Failed', data.error);
  });
}

/**
 * Initialize Kraken service
 */
async function initializeKrakenService() {
  try {
    const result = await window.electronAPI.invoke('kraken:get-service-status');
    if (result.success && result.status.initialized) {
      startDeviceDiscovery();
    }
  } catch (error) {
    showServiceError('Failed to initialize Kraken service');
  }
}

/**
 * Start device discovery
 */
async function startDeviceDiscovery() {
  try {
    const result = await window.electronAPI.invoke('kraken:start-discovery');
    if (!result.success) {
      showAlert('error', 'Discovery Failed', result.error);
    }
  } catch (error) {
    showAlert('error', 'Discovery Failed', 'Failed to start device discovery');
  }
}

/**
 * Refresh device discovery
 */
async function refreshDeviceDiscovery() {
  try {
    // Clear current devices
    discoveredDevices.clear();
    selectedDevices.clear();
    updateDeviceList();
    updateUI();

    const result = await window.electronAPI.invoke('kraken:refresh-discovery');
    if (!result.success) {
      showAlert('error', 'Refresh Failed', result.error);
    }
  } catch (error) {
    showAlert('error', 'Refresh Failed', 'Failed to refresh device discovery');
  }
}

/**
 * Handle device discovered event
 */
function handleDeviceDiscovered(device) {
  discoveredDevices.set(device.id, device);
  updateDeviceList();
  updateUI();
}

/**
 * Handle search input
 */
function handleSearch() {
  updateDeviceList();
}

/**
 * Handle sort change
 */
function handleSortChange() {
  sortBy = elements.sortDropdown.value;
  updateDeviceList();
}

/**
 * Handle select all checkbox
 */
function handleSelectAll() {
  const isChecked = elements.selectAll.checked;
  const checkboxes = elements.sensorList.querySelectorAll('.device-checkbox');
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = isChecked;
    const deviceId = checkbox.dataset.deviceId;
    
    if (isChecked) {
      selectedDevices.add(deviceId);
    } else {
      selectedDevices.delete(deviceId);
    }
  });
  
  updateUI();
}

/**
 * Handle device checkbox change
 */
function handleDeviceCheckboxChange(event) {
  const deviceId = event.target.dataset.deviceId;
  
  if (event.target.checked) {
    selectedDevices.add(deviceId);
  } else {
    selectedDevices.delete(deviceId);
  }
  
  // Update select all checkbox
  const totalCheckboxes = elements.sensorList.querySelectorAll('.device-checkbox').length;
  const checkedCheckboxes = elements.sensorList.querySelectorAll('.device-checkbox:checked').length;
  
  elements.selectAll.checked = totalCheckboxes > 0 && totalCheckboxes === checkedCheckboxes;
  
  updateUI();
}

/**
 * Handle connect selected devices
 */
async function handleConnectSelected() {
  if (selectedDevices.size === 0) {
    showAlert('warning', 'No Selection', 'Please select at least one device to connect.');
    return;
  }

  try {
    const deviceIds = Array.from(selectedDevices);
    const result = await window.electronAPI.invoke('kraken:connect-devices', deviceIds);
    
    if (!result.success) {
      showAlert('error', 'Connection Failed', result.error);
    }
    // Success handling is done in event listeners
  } catch (error) {
    showAlert('error', 'Connection Failed', 'Failed to connect to devices');
  }
}

/**
 * Handle successful connection
 */
function handleConnectionCompleted(data) {
  showConnectionResults(data.devices, []);
}

/**
 * Handle partially failed connection
 */
function handleConnectionPartiallyFailed(data) {
  showConnectionResults(data.connected, data.failed);
}

/**
 * Show connection results modal
 */
function showConnectionResults(connected, failed) {
  let html = '';
  
  if (connected.length > 0) {
    html += '<div class="mb-4">';
    html += '<h4 class="font-semibold text-green-600 mb-2">Successfully Connected:</h4>';
    html += '<ul class="space-y-1">';
    connected.forEach(device => {
      html += `<li class="flex items-center text-sm">
        <i class="fa-solid fa-check-circle text-green-500 mr-2"></i>
        ${device.name} (${device.id})
      </li>`;
    });
    html += '</ul></div>';
  }
  
  if (failed.length > 0) {
    html += '<div class="mb-4">';
    html += '<h4 class="font-semibold text-red-600 mb-2">Failed to Connect:</h4>';
    html += '<ul class="space-y-1">';
    failed.forEach(device => {
      html += `<li class="flex items-center text-sm">
        <i class="fa-solid fa-times-circle text-red-500 mr-2"></i>
        ${device.name} (${device.id})
      </li>`;
    });
    html += '</ul></div>';
  }
  
  elements.connectionResults.innerHTML = html;
  
  // Show continue button only if some devices connected
  if (connected.length > 0) {
    elements.modalContinue.classList.remove('hidden');
  } else {
    elements.modalContinue.classList.add('hidden');
  }
  
  elements.connectionModal.classList.remove('hidden');
}

/**
 * Close connection modal
 */
function closeConnectionModal() {
  elements.connectionModal.classList.add('hidden');
}

/**
 * Proceed to calibration page
 */
function proceedToCalibration() {
  closeConnectionModal();
  window.electronAPI.send('kraken:load-calibration');
}

/**
 * Update device list display
 */
function updateDeviceList() {
  const searchTerm = elements.sensorSearch.value.toLowerCase();
  let devices = Array.from(discoveredDevices.values());
  
  // Filter by search term
  if (searchTerm) {
    devices = devices.filter(device => 
      device.id.toLowerCase().includes(searchTerm) ||
      device.name.toLowerCase().includes(searchTerm)
    );
  }
  
  // Sort devices
  devices.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'signal':
        return b.rssi - a.rssi; // Higher RSSI first
      default:
        return a.id.localeCompare(b.id);
    }
  });
  
  // Render devices
  if (devices.length === 0) {
    elements.sensorList.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
  } else {
    elements.emptyState.classList.add('hidden');
    renderDevices(devices);
  }
}

/**
 * Render devices in the list
 */
function renderDevices(devices) {
  let html = '';
  
  devices.forEach(device => {
    const signalInfo = getSignalInfo(device.rssi);
    const isSelected = selectedDevices.has(device.id);
    
    html += `
      <div class="grid grid-cols-12 gap-4 px-6 py-4 border-b border-neutral-100 hover:bg-neutral-50">
        <div class="col-span-1">
          <input 
            type="checkbox" 
            class="device-checkbox w-4 h-4" 
            data-device-id="${device.id}"
            ${isSelected ? 'checked' : ''}
          />
        </div>
        <div class="col-span-3 font-mono text-sm">${device.id}</div>
        <div class="col-span-2">${device.name}</div>
        <div class="col-span-2">
          <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
            Discovered
          </span>
        </div>
        <div class="col-span-2">
          <div class="flex items-center">
            <div class="w-16 h-2 bg-neutral-200 rounded-full mr-2">
              <div 
                class="h-2 rounded-full ${signalInfo.colorClass}" 
                style="width: ${signalInfo.barWidth}%"
              ></div>
            </div>
            <span class="text-sm text-neutral-600">
              ${signalInfo.strength} (${device.rssi})
            </span>
          </div>
        </div>
        <div class="col-span-2">
          <button 
            class="text-blue-600 hover:text-blue-800 text-sm"
            onclick="viewDeviceDetails('${device.id}')"
          >
            Details
          </button>
        </div>
      </div>
    `;
  });
  
  elements.sensorList.innerHTML = html;
  
  // Add event listeners to checkboxes
  elements.sensorList.querySelectorAll('.device-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleDeviceCheckboxChange);
  });
}

/**
 * Get signal strength information
 */
function getSignalInfo(rssi) {
  if (rssi >= -40) {
    return { strength: 'Excellent', barWidth: 100, colorClass: 'bg-green-500' };
  } else if (rssi >= -55) {
    return { strength: 'Good', barWidth: 75, colorClass: 'bg-green-400' };
  } else if (rssi >= -70) {
    return { strength: 'Fair', barWidth: 50, colorClass: 'bg-yellow-400' };
  } else {
    return { strength: 'Poor', barWidth: 25, colorClass: 'bg-red-500' };
  }
}

/**
 * View device details (placeholder)
 */
function viewDeviceDetails(deviceId) {
  const device = discoveredDevices.get(deviceId);
  if (device) {
    const details = `
      Device ID: ${device.id}
      Name: ${device.name}
      Signal Strength: ${device.rssi} dBm
    `;
    showAlert('info', 'Device Details', details);
  }
}

/**
 * Update UI state
 */
function updateUI() {
  // Update device count
  elements.deviceCount.textContent = `${discoveredDevices.size} devices discovered`;
  
  // Update selected count
  if (selectedDevices.size > 0) {
    elements.selectedCount.textContent = `${selectedDevices.size} selected`;
    elements.selectedCount.classList.remove('hidden');
  } else {
    elements.selectedCount.classList.add('hidden');
  }
  
  // Update connect button state
  elements.connectSelected.disabled = selectedDevices.size === 0;
}

/**
 * Show/hide loader
 */
function showLoader(message = 'Loading...') {
  elements.loader.querySelector('p').textContent = message;
  elements.loader.classList.remove('hidden');
}

function hideLoader() {
  elements.loader.classList.add('hidden');
}

/**
 * Show/hide error messages
 */
function showBluetoothError() {
  elements.bluetoothError.classList.remove('hidden');
}

function hideBluetoothError() {
  elements.bluetoothError.classList.add('hidden');
}

function showServiceError(message) {
  elements.serviceErrorMessage.textContent = message;
  elements.serviceError.classList.remove('hidden');
}

function hideServiceError() {
  elements.serviceError.classList.add('hidden');
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

function closeAlertModal() {
  elements.alertModal.classList.add('hidden');
}

// Make functions available globally for onclick handlers
window.viewDeviceDetails = viewDeviceDetails;
