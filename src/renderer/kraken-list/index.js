const renderedDeviceIds = new Set();
const discoveredDevices = [];
let lastSortKey = "Sensor Id"; // Default sort
const selectedSensorIds = new Set();

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("back-button-kraken-list")
    .addEventListener("click", () => {
      window.electronAPI.cleanupKrakenList();
      window.electronAPI.loadHomeScreen();
    });

  const loader = document.getElementById("loader");
  loader?.classList.add("hidden");
  const selectAllCheckbox = document.getElementById("select-all-checkbox");

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", () => {
      const allCheckboxes = document.querySelectorAll(".sensor-checkbox");
      const checked = selectAllCheckbox.checked;

      allCheckboxes.forEach((cb) => {
        cb.checked = checked;
        const id = cb.dataset.sensorId;
        if (checked) {
          selectedSensorIds.add(id);
        } else {
          selectedSensorIds.delete(id);
        }
      });

      updateConnectButtonState();
    });
  }

  document.querySelectorAll(".sensor-checkbox:checked").forEach((checkbox) => {
    checkbox.checked = false;
  });

  renderedDeviceIds.clear();

  const connectSensorsBtn = document.getElementById("connect-sensors-button");
  if (connectSensorsBtn) {
    connectSensorsBtn.addEventListener("click", async () => {
      const selectedSensors = Array.from(
        document.querySelectorAll(".sensor-checkbox:checked")
      ).map((checkbox) => checkbox.dataset.sensorId);

      if (selectedSensors.length > 0) {
        await window.electronAPI.krakenConnectDevices(selectedSensors);
      } else {
        showCustomAlert("Please select at least one sensor before connecting.");
      }
    });
  }

  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      // Clear current list
      const sensorList = document.getElementById("sensor-list");
      while (sensorList.children.length > 1) {
        sensorList.removeChild(sensorList.lastChild);
      }
      renderedDeviceIds.clear();
      discoveredDevices.length = 0;
      selectedSensorIds.clear();
      renderSensorList([]);
      
      // Start refresh scan
      await window.electronAPI.krakenRefreshScan();
    });
  }



  // Sorting
  const sortDropdown = document.getElementById("sort-list");
  if (sortDropdown) {
    sortDropdown.addEventListener("change", () => {
      lastSortKey = sortDropdown.value;
      sortAndRender();
    });
  }

  // Search
  const searchInput = document.getElementById("sensor-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLowerCase();

      let filtered = discoveredDevices.filter((device) => {
        return (
          device.id.toLowerCase().includes(query) ||
          device.name.toLowerCase().includes(query)
        );
      });

      if (lastSortKey.includes("Sensor Id")) {
        filtered.sort((a, b) => a.id.localeCompare(b.id));
      } else if (lastSortKey.includes("Name")) {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
      }

      renderSensorList(filtered);
    });
  }

  // Start scanning automatically when page loads
  window.electronAPI.krakenStartScan();
});

window.electronAPI.onDeviceDiscovered((device) => {
  if (!renderedDeviceIds.has(device.id)) {
    renderedDeviceIds.add(device.id);
    discoveredDevices.push(device);
    sortAndRender(); // Sort with latest sort selection
  }
});

// Handle device updates for live signal strength updates
window.electronAPI.onDeviceUpdated((device) => {
  const index = discoveredDevices.findIndex((p) => p.id === device.id);
  if (index !== -1) {
    discoveredDevices[index] = device;
    const signalData = getSignalStrength(device.rssi);

    const signalStrength = document.getElementById(
      `signal-strength-${device.id}`
    );
    if (signalStrength) {
      signalStrength.innerText = `${signalData.signalStrength} (${device.rssi})`;
    }

    const progressBar = document.getElementById(
      `signal-progress-bar-${device.id}`
    );
    if (progressBar) {
      progressBar.style.width = `${signalData.barWidth}%`;
      progressBar.className = `h-2 rounded-full ${signalData.colorClass}`;
    }
  }
});

window.electronAPI.onShowBluetoothError((val) => {
  let para = document.getElementById("bluetooth-error");
  if (val) {
    para.classList.remove("hidden");
  } else {
    para.classList.add("hidden");
  }
});

// Prevent loader flickering by adding state management
let loaderState = {
  isVisible: false,
  hideTimeout: null,
  showTimeout: null
};

window.electronAPI.onShowLoader(() => {
  // Clear any pending hide operation
  if (loaderState.hideTimeout) {
    clearTimeout(loaderState.hideTimeout);
    loaderState.hideTimeout = null;
  }
  
  // Only show if not already visible to prevent flickering
  if (!loaderState.isVisible) {
    const loader = document.getElementById("loader");
    if (loader) {
      loader.classList.remove("hidden");
      loaderState.isVisible = true;
    }
  }
});

window.electronAPI.onHideLoader(() => {
  // Clear any pending show operation
  if (loaderState.showTimeout) {
    clearTimeout(loaderState.showTimeout);
    loaderState.showTimeout = null;
  }
  
  // Add a small delay before hiding to prevent rapid show/hide cycles
  loaderState.hideTimeout = setTimeout(() => {
    const loader = document.getElementById("loader");
    if (loader && loaderState.isVisible) {
      loader.classList.add("hidden");
      loaderState.isVisible = false;
    }
    loaderState.hideTimeout = null;
  }, 100); // 100ms delay to smooth out rapid state changes
});

// Handle sequential connection progress
window.electronAPI.onDeviceConnectionStarted((data) => {
  const { deviceId, currentIndex, totalCount, deviceName } = data;
  const loader = document.getElementById("loader");
  const loaderText = loader?.querySelector('p');
  if (loaderText) {
    loaderText.textContent = `Connecting to device ${currentIndex}/${totalCount}: ${deviceName}...`;
  }
  console.log(`Starting connection to device ${currentIndex}/${totalCount}: ${deviceName}`);
});

window.electronAPI.onDeviceConnectionSuccess((data) => {
  const { deviceId, currentIndex, totalCount, connectedCount } = data;
  console.log(`Successfully connected device ${currentIndex}/${totalCount}. Total connected: ${connectedCount}`);
});

window.electronAPI.onDeviceConnectionFailed((data) => {
  const { deviceId, currentIndex, totalCount, error, deviceName } = data;
  console.log(`Failed to connect device ${currentIndex}/${totalCount} (${deviceName}): ${error}`);
});

window.electronAPI.onDeviceConnectionRetry((data) => {
  const { deviceId, retryAttempt, maxRetries, deviceName } = data;
  const loader = document.getElementById("loader");
  const loaderText = loader?.querySelector('p');
  if (loaderText) {
    loaderText.textContent = `Retrying connection (${retryAttempt}/${maxRetries}): ${deviceName}...`;
  }
  console.log(`Retrying connection to ${deviceName} (${retryAttempt}/${maxRetries})`);
});

window.electronAPI.onShowConnectionErrors((data) => {
  const { successful, failed, totalSelected, canProceed } = data;
  let message = '';

  message += `Connection Results: ${successful}/${totalSelected || (successful + failed.length)} devices connected successfully.\n\n`;

  if (successful > 0) {
    message += `✓ Successfully connected to ${successful} device${successful !== 1 ? 's' : ''}.\n\n`;
  }

  if (failed.length > 0) {
    message += `✗ Failed to connect to ${failed.length} device${failed.length !== 1 ? 's' : ''}:\n`;
    failed.forEach(device => {
      message += `• ${device.name || device.id}: ${device.error}\n`;
    });
  }

  // Show modal with option to proceed if some devices connected successfully
  if (canProceed) {
    message += `\n\nDo you want to proceed with the ${successful} successfully connected device${successful !== 1 ? 's' : ''}?`;
    showConnectionResultsModal(message, true);
  } else {
    // All failed - show simple alert
    showCustomAlert(message);
  }
});

window.electronAPI.onNavigateToCalibration((data) => {
  const { connectedDeviceIds, totalSelected, successfulCount } = data;
  if (connectedDeviceIds && connectedDeviceIds.length > 0) {
    // Ensure loader is hidden before navigation
    if (loaderState.hideTimeout) {
      clearTimeout(loaderState.hideTimeout);
      loaderState.hideTimeout = null;
    }
    const loader = document.getElementById("loader");
    if (loader) {
      loader.classList.add("hidden");
      loaderState.isVisible = false;
    }
    
    console.log(`Navigating to calibration with ${connectedDeviceIds.length} devices`);
    
    // Add a small delay to ensure any popups are processed before navigation
    setTimeout(() => {
      window.electronAPI.loadKrakenCalibration(connectedDeviceIds);
    }, 200);
  }
});

// Handle connect button cooldown (like old app - 2 seconds for hardware to cool down)
window.electronAPI.onEnableConnectCooldown((data) => {
  const { cooldownMs } = data;
  const connectBtn = document.getElementById("connect-sensors-button");
  
  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.classList.add("opacity-50", "cursor-not-allowed");
    
    setTimeout(() => {
      connectBtn.disabled = false;
      connectBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }, cooldownMs);
  }
});

// Handle kraken cleanup events (like old app - disable during background kraken cleanup)
window.electronAPI.onKrakenCleanupStarted(() => {
  console.log("Background kraken cleanup started - disabling connect button");
  const connectBtn = document.getElementById("connect-sensors-button");
  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.classList.add("opacity-50", "cursor-not-allowed");
    connectBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Cleaning up krakens...';
  }
});

window.electronAPI.onKrakenCleanupCompleted(() => {
  console.log("Background kraken cleanup completed - re-enabling connect button");
  const connectBtn = document.getElementById("connect-sensors-button");
  if (connectBtn) {
    connectBtn.disabled = false;
    connectBtn.classList.remove("opacity-50", "cursor-not-allowed");
    connectBtn.innerHTML = '<i class="fa-solid fa-upload mr-2"></i> Connect Sensors';
  }
});

function showCustomAlert(message) {
  const alertBox = document.getElementById("custom-alert");
  const alertMessage = document.getElementById("custom-alert-message");
  const alertOkBtn = document.getElementById("custom-alert-ok");

  alertMessage.textContent = message;
  alertBox.classList.remove("hidden");

  alertOkBtn.onclick = () => {
    alertBox.classList.add("hidden");
  };
}

function showConnectionResultsModal(message, canProceed = false) {
  // Create modal if it doesn't exist
  let modal = document.getElementById("connection-results-modal");
  if (!modal) {
    modal = createConnectionResultsModal();
    document.body.appendChild(modal);
  }

  const messageElement = modal.querySelector("#connection-results-message");
  const proceedBtn = modal.querySelector("#proceed-to-calibration-btn");
  const cancelBtn = modal.querySelector("#cancel-connection-btn");

  messageElement.textContent = message;
  
  // Show/hide proceed button based on whether user can continue
  if (canProceed) {
    proceedBtn.classList.remove("hidden");
  } else {
    proceedBtn.classList.add("hidden");
  }

  modal.classList.remove("hidden");

  // Handle proceed button click
  proceedBtn.onclick = async () => {
    modal.classList.add("hidden");
    try {
      const result = await window.electronAPI.krakenProceedToCalibration();
      if (!result.success) {
        showCustomAlert(`Failed to proceed to calibration: ${result.error}`);
      }
    } catch (error) {
      showCustomAlert(`Error proceeding to calibration: ${error.message}`);
    }
  };

  // Handle cancel button click
  cancelBtn.onclick = () => {
    modal.classList.add("hidden");
  };
}

function createConnectionResultsModal() {
  const modal = document.createElement("div");
  modal.id = "connection-results-modal";
  modal.className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden";
  
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-semibold mb-4">Connection Results</h3>
      <p id="connection-results-message" class="text-sm text-gray-700 mb-6 whitespace-pre-line"></p>
      <div class="flex justify-end space-x-2">
        <button
          id="cancel-connection-btn"
          class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
        >
          Cancel
        </button>
        <button
          id="proceed-to-calibration-btn"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Continue to Calibration
        </button>
      </div>
    </div>
  `;
  
  return modal;
}

function sortAndRender() {
  const query = document
    .getElementById("sensor-search")
    ?.value.trim()
    .toLowerCase();
  let filtered = [...discoveredDevices];

  if (query) {
    filtered = filtered.filter((device) => {
      return (
        device.id.toLowerCase().includes(query) ||
        device.name.toLowerCase().includes(query)
      );
    });
  }

  if (lastSortKey.includes("Sensor Id")) {
    filtered.sort((a, b) => a.id.localeCompare(b.id));
  } else if (lastSortKey.includes("Name")) {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  renderSensorList(filtered);
}

function renderSensorList(devices) {
  const sensorList = document.getElementById("sensor-list");

  while (sensorList.children.length > 1) {
    sensorList.removeChild(sensorList.lastChild);
  }

  devices.forEach((device) => {
    const signalData = getSignalStrength(device.rssi);
    const deviceRow = document.createElement("div");
    deviceRow.className =
      "sensor-item grid grid-cols-12 gap-4 px-6 py-4 border-b border-neutral-100 hover:bg-neutral-50";

    deviceRow.innerHTML = `
      <div class="col-span-1">
       <input type="checkbox" class="sensor-checkbox w-4 h-4" data-sensor-id="${
         device.id
       }" ${selectedSensorIds.has(device.id) ? "checked" : ""}/>
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
          <p id="signal-strength-${device.id}" class="px-3 text-sm">${
      signalData.signalStrength
    } (${device.rssi})</p>
        </div>
      </div>
    `;

    sensorList.appendChild(deviceRow);

    const progressBar = document.getElementById(
      `signal-progress-bar-${device.id}`
    );
    if (progressBar) {
      progressBar.style.width = `${signalData.barWidth}%`;
      progressBar.className = `h-2 rounded-full ${signalData.colorClass}`;
    }

    const checkbox = deviceRow.querySelector(".sensor-checkbox");
    checkbox.addEventListener("change", (e) => {
      const id = e.target.dataset.sensorId;
      if (e.target.checked) {
        selectedSensorIds.add(id);
      } else {
        selectedSensorIds.delete(id);
      }

      // ✅ Sync Select All checkbox if needed
      const all = document.querySelectorAll(".sensor-checkbox");
      const selected = document.querySelectorAll(".sensor-checkbox:checked");

      const selectAllCheckbox = document.getElementById("select-all-checkbox");
      if (selectAllCheckbox) {
        selectAllCheckbox.checked =
          all.length > 0 && all.length === selected.length;
      }

      updateConnectButtonState();
    });
  });

  // Sync "Select All" checkbox with current state
  const selectAllCheckbox = document.getElementById("select-all-checkbox");
  if (selectAllCheckbox) {
    const checkboxes = document.querySelectorAll(".sensor-checkbox");
    const checked = document.querySelectorAll(".sensor-checkbox:checked");
    selectAllCheckbox.checked =
      checkboxes.length > 0 && checkboxes.length === checked.length;
  }
}

function updateConnectButtonState() {
  const anyChecked =
    document.querySelectorAll(".sensor-checkbox:checked").length > 0;
  const connectSensorsBtn = document.getElementById("connect-sensors-button");
  connectSensorsBtn.disabled = !anyChecked;
  connectSensorsBtn.classList.toggle("opacity-50", !anyChecked);
  connectSensorsBtn.classList.toggle("cursor-not-allowed", !anyChecked);
}

// Function to map RSSI to signal strength
function getSignalStrength(rssi) {
  let barWidth = 0;
  let signalStrength = "";
  let colorClass = "";

  if (rssi >= -40) {
    signalStrength = "Good"; // -40 to 0
    barWidth = 100;
    colorClass = "bg-green-500";
  } else if (rssi >= -70) {
    signalStrength = "Weak"; // -70 to -41
    barWidth = 60;
    colorClass = "bg-amber-400";
  } else {
    signalStrength = "Poor"; // <= -71
    barWidth = 20;
    colorClass = "bg-red-500";
  }
  return {
    barWidth: barWidth,
    signalStrength: signalStrength,
    colorClass: colorClass,
  };
} 