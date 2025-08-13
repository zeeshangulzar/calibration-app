const connectedDevices = new Map();
let allDevicesReady = false;

document.addEventListener("DOMContentLoaded", () => {
  // Back button functionality
  document
    .getElementById("back-button-calibration")
    .addEventListener("click", () => {
      window.electronAPI.krakenCalibrationGoBack();
    });

  // Start calibration button
  const startCalibrationBtn = document.getElementById("start-calibration-btn");
  if (startCalibrationBtn) {
    startCalibrationBtn.addEventListener("click", async () => {
      if (allDevicesReady) {
        try {
          const result = await window.electronAPI.krakenCalibrationStart();
          if (!result.success) {
            showError(`Failed to start calibration: ${result.error}`);
          }
        } catch (error) {
          showError(`Error starting calibration: ${error.message}`);
        }
      }
    });
  }

  // Error alert OK button
  document.getElementById("error-ok-btn").addEventListener("click", () => {
    document.getElementById("error-alert").classList.add("hidden");
  });
});

// Event listeners for calibration events
window.electronAPI.onShowPageLoader(() => {
  document.getElementById("page-loader")?.classList.remove("hidden");
});

window.electronAPI.onHidePageLoader(() => {
  document.getElementById("page-loader")?.classList.add("hidden");
});

window.electronAPI.onInitializeDevices((devices) => {
  initializeDeviceWidgets(devices);
});

window.electronAPI.onDeviceSetupStarted((data) => {
  const { deviceId } = data;
  updateDeviceWidget(deviceId, 'in-progress', 'Starting setup...');
});

window.electronAPI.onDeviceSetupStage((data) => {
  const { deviceId, stage, message } = data;
  updateDeviceWidget(deviceId, 'in-progress', message, stage);
});

window.electronAPI.onDeviceSetupComplete((data) => {
  const { deviceId } = data;
  updateDeviceWidget(deviceId, 'ready', 'Ready for calibration');
});

window.electronAPI.onDeviceSetupFailed((data) => {
  const { deviceId, error } = data;
  updateDeviceWidget(deviceId, 'failed', error);
});

window.electronAPI.onDeviceStatusUpdate((data) => {
  const { deviceId, status } = data;
  updateDeviceFromStatus(deviceId, status);
});

window.electronAPI.onProgressUpdate((data) => {
  updateProgressSummary(data);
});

window.electronAPI.onAllDevicesReady(() => {
  allDevicesReady = true;
  const startBtn = document.getElementById("start-calibration-btn");
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.classList.remove("opacity-50", "cursor-not-allowed");
  }
  
  // Update status message
  document.getElementById("connection-status").textContent = "All devices ready for calibration";
});

window.electronAPI.onDeviceDataUpdate((data) => {
  const { deviceId, pressure } = data;
  updateDevicePressureData(deviceId, pressure);
});

// Connectivity event listeners
window.electronAPI.onDeviceConnectivityLost((data) => {
  const { deviceId, message } = data;
  console.log(`Device ${deviceId} lost connectivity:`, message);
  updateDeviceWidget(deviceId, 'disconnected', message);
});

window.electronAPI.onDeviceReconnectionStarted((data) => {
  const { deviceId } = data;
  console.log(`Device ${deviceId} reconnection started`);
  updateDeviceWidget(deviceId, 'in-progress', 'Reconnecting...');
});

window.electronAPI.onDeviceReconnectionSuccess((data) => {
  const { deviceId } = data;
  console.log(`Device ${deviceId} reconnected successfully`);
  // Status will be updated via normal device-status-update event
});

window.electronAPI.onDeviceReconnectionFailed((data) => {
  const { deviceId, error } = data;
  console.log(`Device ${deviceId} reconnection failed:`, error);
  updateDeviceWidget(deviceId, 'disconnected', `Reconnection failed: ${error}`);
});

window.electronAPI.onDeviceManualDisconnectStarted((data) => {
  const { deviceId } = data;
  console.log(`Device ${deviceId} manual disconnect started`);
  updateDeviceWidget(deviceId, 'in-progress', 'Removing...');
  
  // Disable all interactions on this widget
  const widget = document.getElementById(`device-widget-${deviceId}`);
  if (widget) {
    widget.style.pointerEvents = 'none';
    widget.style.opacity = '0.6';
    widget.classList.add('removing');
    
    // Add visual removing effect
    widget.style.transform = 'scale(0.95)';
    widget.style.transition = 'all 0.3s ease';
  }
});

window.electronAPI.onDeviceManualDisconnectSuccess((data) => {
  const { deviceId } = data;
  console.log(`Device ${deviceId} manually disconnected and removed`);
  
  // Animate widget removal
  const widget = document.getElementById(`device-widget-${deviceId}`);
  if (widget) {
    // Add removal animation
    widget.style.transform = 'scale(0.8)';
    widget.style.opacity = '0';
    widget.style.transition = 'all 0.4s ease';
    
    // Remove widget after animation completes
    setTimeout(() => {
      if (widget.parentNode) {
        widget.remove();
      }
    }, 400);
  }
  
  // Show success message (temporary notification)
  showNotification(`Kraken ${deviceId.substring(0, 8)}... removed from calibration`, 'success');
});

window.electronAPI.onDeviceManualDisconnectFailed((data) => {
  const { deviceId, error } = data;
  console.log(`Device ${deviceId} manual disconnect failed:`, error);
  
  // Re-enable widget interactions
  const widget = document.getElementById(`device-widget-${deviceId}`);
  if (widget) {
    widget.style.pointerEvents = 'auto';
    widget.style.opacity = '1';
    widget.style.transform = 'scale(1)';
    widget.classList.remove('removing');
  }
  
  showNotification(`Failed to remove kraken: ${error}`, 'error');
});

window.electronAPI.onUpdateCalibrationButtonState((data) => {
  const { enabled, deviceCount } = data;
  const startBtn = document.getElementById("start-calibration-btn");
  if (startBtn) {
    startBtn.disabled = !enabled;
    if (enabled) {
      startBtn.classList.remove("opacity-50", "cursor-not-allowed");
    } else {
      startBtn.classList.add("opacity-50", "cursor-not-allowed");
    }
  }
  
  // Update status message
  const statusEl = document.getElementById("connection-status");
  if (statusEl) {
    if (deviceCount === 0) {
      statusEl.textContent = "No devices connected";
    } else if (enabled) {
      statusEl.textContent = "All devices ready for calibration";
    } else {
      statusEl.textContent = "Some devices are disconnected or not ready";
    }
  }
});

window.electronAPI.onDeviceDisconnected((data) => {
  const { deviceId } = data;
  handleDeviceDisconnection(deviceId);
});

window.electronAPI.onCalibrationStarted(() => {
  // Handle calibration start
  showInfo("Calibration started successfully!");
});

// Initialize device widgets in the grid
function initializeDeviceWidgets(devices) {
  const devicesGrid = document.getElementById("devices-grid");
  if (!devicesGrid) return;

  // Clear existing widgets
  devicesGrid.innerHTML = "";
  connectedDevices.clear();

  devices.forEach(device => {
    connectedDevices.set(device.id, device);
    const widget = createDeviceWidget(device);
    devicesGrid.appendChild(widget);
  });

  // Update progress summary
  updateProgressSummary({
    total: devices.length,
    ready: 0,
    failed: 0,
    pending: devices.length,
    progress: 0
  });
}

// Create individual device widget (using old app design)
function createDeviceWidget(device) {
  const widget = document.createElement("div");
  widget.id = `device-widget-${device.id}`;
  widget.className = "rounded-md border bg-white p-4 shadow-sm transition-all duration-200";

  widget.innerHTML = `
    <!-- Header with disconnect button -->
    <div class="flex justify-between items-start mb-2">
      <h4 class="font-medium">Sensor ${device.displayName}</h4>
      <button 
        onclick="disconnectDevice('${device.id}')"
        class="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full p-1 transition-colors duration-200"
        title="Disconnect and remove this kraken">
        <i class="fa-solid fa-times text-sm"></i>
      </button>
    </div>
    
    <div class="mb-1 text-sm text-neutral-500" id="device-status-message-${device.id}">Pending...</div>
    <div class="w-full bg-neutral-200 h-2 rounded-full overflow-hidden mb-3">
      <div id="device-progress-${device.id}" class="bg-neutral-800 h-2 rounded-full transition-all duration-500" style="width: 0%;"></div>
    </div>
    
    <!-- Device Info -->
    <div class="text-xs text-neutral-500 mb-2">
      <div>ID: ${device.id}</div>
      <div>Firmware: ${device.firmwareVersion}</div>
    </div>

    <!-- Action Area -->
    <div id="device-action-${device.id}" class="hidden mt-3 space-y-2">
      <button 
        onclick="retryDeviceSetup('${device.id}')"
        class="w-full px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors duration-200 text-sm">
        <i class="fa-solid fa-retry mr-1"></i> Retry Setup
      </button>
    </div>

    <!-- Reconnection Area (for disconnected devices) -->
    <div id="device-reconnect-${device.id}" class="hidden mt-3">
      <button 
        onclick="reconnectDevice('${device.id}')"
        class="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 text-sm">
        <i class="fa-solid fa-wifi mr-1"></i> Reconnect
      </button>
    </div>

    <!-- Pressure Data (shown when ready) -->
    <div id="device-data-${device.id}" class="hidden mt-3 bg-neutral-50 rounded-md p-2">
      <div class="text-xs text-neutral-500 mb-1">Live Pressure Reading</div>
      <div id="device-pressure-${device.id}" class="text-sm font-mono">-- PSI</div>
    </div>
  `;

  return widget;
}

// Update device widget based on status (using old app style)
function updateDeviceWidget(deviceId, status, message, stage = null) {
  const statusMessage = document.getElementById(`device-status-message-${deviceId}`);
  const progressBar = document.getElementById(`device-progress-${deviceId}`);
  const actionArea = document.getElementById(`device-action-${deviceId}`);
  const dataArea = document.getElementById(`device-data-${deviceId}`);
  const widget = document.getElementById(`device-widget-${deviceId}`);

  if (!widget) return;

  // Update message
  if (statusMessage) {
    statusMessage.textContent = message || '';
  }

  // Update progress and styling based on status (like old app)
  if (progressBar && widget) {
    switch (status) {
      case 'pending':
        progressBar.style.width = '0%';
        progressBar.className = 'bg-neutral-800 h-2 rounded-full transition-all duration-500';
        widget.className = 'rounded-md border bg-white p-4 shadow-sm transition-all duration-200';
        break;
      case 'in-progress':
        let progress = 25;
        if (stage === 'discovering') progress = 50;
        if (stage === 'subscribing') progress = 75;
        
        progressBar.style.width = `${progress}%`;
        progressBar.className = 'bg-blue-600 h-2 rounded-full transition-all duration-500';
        widget.className = 'rounded-md border border-blue-300 bg-blue-50 p-4 shadow-sm transition-all duration-200';
        break;
      case 'ready':
        progressBar.style.width = '100%';
        progressBar.className = 'bg-green-600 h-2 rounded-full transition-all duration-500';
        widget.className = 'rounded-md border border-green-300 bg-green-50 p-4 shadow-sm transition-all duration-200';
        
        // Show data area for ready devices
        if (dataArea) {
          dataArea.classList.remove('hidden');
        }
        break;
      case 'failed':
        progressBar.style.width = '100%';
        progressBar.className = 'bg-red-600 h-2 rounded-full transition-all duration-500';
        widget.className = 'rounded-md border border-red-300 bg-red-50 p-4 shadow-sm transition-all duration-200';
        
        // Show retry button
        if (actionArea) {
          actionArea.classList.remove('hidden');
        }
        break;
    }
  }

  // Show/hide action areas based on status
  const reconnectArea = document.getElementById(`device-reconnect-${deviceId}`);
  
  if (actionArea && status !== 'failed') {
    actionArea.classList.add('hidden');
  }
  
  if (reconnectArea) {
    if (status === 'disconnected') {
      reconnectArea.classList.remove('hidden');
    } else {
      reconnectArea.classList.add('hidden');
    }
  }

  // Hide data area for non-ready states
  if (dataArea && status !== 'ready') {
    dataArea.classList.add('hidden');
  }
  
  // Update widget visual state for disconnected devices
  const deviceWidget = document.getElementById(`device-widget-${deviceId}`);
  if (deviceWidget) {
    if (status === 'disconnected') {
      deviceWidget.classList.add('border-red-300', 'bg-red-50');
      deviceWidget.classList.remove('border-green-300', 'bg-green-50');
    } else if (status === 'ready') {
      deviceWidget.classList.add('border-green-300', 'bg-green-50');
      deviceWidget.classList.remove('border-red-300', 'bg-red-50');
    } else {
      deviceWidget.classList.remove('border-red-300', 'bg-red-50', 'border-green-300', 'bg-green-50');
    }
  }
}

// Update device from detailed status object
function updateDeviceFromStatus(deviceId, statusObj) {
  const { status, stage, error } = statusObj;
  let message = '';

  switch (status) {
    case 'pending':
      if (stage === 'reconnecting') {
        message = 'Reconnecting to device...';
      } else {
        message = 'Waiting to start setup...';
      }
      break;
    case 'in-progress':
      if (stage === 'connecting') message = 'Reconnecting to device...';
      else if (stage === 'discovering') message = 'Discovering services...';
      else if (stage === 'subscribing') message = 'Setting up characteristics...';
      else if (stage === 'disconnecting') message = 'Disconnecting device...';
      else message = 'Setting up device...';
      break;
    case 'ready':
      message = 'Ready for calibration';
      break;
    case 'failed':
      message = error || 'Setup failed';
      break;
    case 'disconnected':
      message = 'Device disconnected - reconnect to continue';
      break;
  }

  updateDeviceWidget(deviceId, status, message, stage);
}



// Update progress summary
function updateProgressSummary(data) {
  const { total, ready, failed, pending, progress } = data;

  // document.getElementById("total-devices").textContent = total;
  // document.getElementById("ready-devices").textContent = ready;
  // document.getElementById("pending-devices").textContent = pending;
  
  const progressBar = document.getElementById("progress-bar");
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  // Update connection status
  const connectionStatus = document.getElementById("connection-status");
  if (connectionStatus) {
    if (progress === 100 && failed === 0) {
      connectionStatus.textContent = "All devices ready";
    } else if (failed > 0) {
      connectionStatus.textContent = `${ready} ready, ${failed} failed`;
    } else {
      connectionStatus.textContent = `Setting up devices... ${progress}%`;
    }
  }
}

// Update device pressure data
function updateDevicePressureData(deviceId, pressure) {
  const pressureDisplay = document.getElementById(`device-pressure-${deviceId}`);
  if (pressureDisplay) {
    pressureDisplay.textContent = `${pressure.value.toFixed(2)} ${pressure.unit}`;
  }
}

// Handle device disconnection
function handleDeviceDisconnection(deviceId) {
  const widget = document.getElementById(`device-widget-${deviceId}`);
  if (widget) {
    widget.classList.add('opacity-50');
    updateDeviceWidget(deviceId, 'failed', 'Device disconnected');
  }
  
  connectedDevices.delete(deviceId);
  allDevicesReady = false;
  
  const startBtn = document.getElementById("start-calibration-btn");
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.classList.add("opacity-50", "cursor-not-allowed");
  }
}

// Retry device setup (called from retry button)
async function retryDeviceSetup(deviceId) {
  try {
    const result = await window.electronAPI.krakenCalibrationRetryDevice(deviceId);
    if (!result.success) {
      showError(`Failed to retry device setup: ${result.error}`);
    }
  } catch (error) {
    showError(`Error retrying device setup: ${error.message}`);
  }
}

// Show error alert
function showError(message) {
  const errorAlert = document.getElementById("error-alert");
  const errorMessage = document.getElementById("error-message");
  
  if (errorAlert && errorMessage) {
    errorMessage.textContent = message;
    errorAlert.classList.remove("hidden");
  }
}

// Show info message (placeholder for future implementation)
function showInfo(message) {
  console.log("Info:", message);
  // Could implement a toast notification or similar
}

// Reconnect a disconnected device
async function reconnectDevice(deviceId) {
  try {
    console.log(`Reconnecting device ${deviceId}...`);
    const result = await window.electronAPI.krakenCalibrationReconnectDevice(deviceId);
    
    if (!result.success) {
      alert(`Failed to reconnect device: ${result.error}`);
    }
  } catch (error) {
    console.error('Error reconnecting device:', error);
    alert(`Error reconnecting device: ${error.message}`);
  }
}

// Manually disconnect a device
async function disconnectDevice(deviceId) {
  try {
    const confirmDisconnect = confirm('Are you sure you want to disconnect and remove this kraken from the calibration?');
    if (!confirmDisconnect) return;
    
    console.log(`Manually disconnecting device ${deviceId}...`);
    
    // Immediately disable widget and show removing state
    const widget = document.getElementById(`device-widget-${deviceId}`);
    const disconnectBtn = document.querySelector(`[onclick="disconnectDevice('${deviceId}')"]`);
    
    if (widget) {
      widget.style.pointerEvents = 'none';
      widget.style.opacity = '0.7';
      widget.classList.add('removing');
    }
    
    if (disconnectBtn) {
      disconnectBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-sm"></i>';
      disconnectBtn.disabled = true;
    }
    
    // Update widget status immediately
    updateDeviceWidget(deviceId, 'in-progress', 'Preparing to remove...');
    
    const result = await window.electronAPI.krakenCalibrationDisconnectDevice(deviceId);
    
    if (!result.success) {
      showNotification(`Failed to remove kraken: ${result.error}`, 'error');
      
      // Reset widget state on failure
      if (widget) {
        widget.style.pointerEvents = 'auto';
        widget.style.opacity = '1';
        widget.classList.remove('removing');
      }
      
      if (disconnectBtn) {
        disconnectBtn.innerHTML = '<i class="fa-solid fa-times text-sm"></i>';
        disconnectBtn.disabled = false;
      }
    }
  } catch (error) {
    console.error('Error disconnecting device:', error);
    showNotification(`Error removing kraken: ${error.message}`, 'error');
    
    // Reset widget state on error
    const widget = document.getElementById(`device-widget-${deviceId}`);
    const disconnectBtn = document.querySelector(`[onclick="disconnectDevice('${deviceId}')"]`);
    
    if (widget) {
      widget.style.pointerEvents = 'auto';
      widget.style.opacity = '1';
      widget.classList.remove('removing');
    }
    
    if (disconnectBtn) {
      disconnectBtn.innerHTML = '<i class="fa-solid fa-times text-sm"></i>';
      disconnectBtn.disabled = false;
    }
  }
}

// Simple notification function
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 px-4 py-2 rounded-md shadow-lg text-white z-50 transition-all duration-300 ${
    type === 'success' ? 'bg-green-600' :
    type === 'error' ? 'bg-red-600' :
    'bg-blue-600'
  }`;
  notification.textContent = message;
  
  // Add to body
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Make functions globally available for onclick handlers
window.retryDeviceSetup = retryDeviceSetup;
window.reconnectDevice = reconnectDevice;
window.disconnectDevice = disconnectDevice; 