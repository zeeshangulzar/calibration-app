import { formatDateTime } from '../../shared/helpers/date-helper.js';
import { startCamera, pauseScanning, resumeScanning, stopCamera, checkCameraAvailability } from '../../shared/helpers/camera-helper.js';
import { showNotification, showSuccess, showInfo, showConfirmationModal } from '../../shared/helpers/notification-helper.js';
import { PAGINATION } from '../../config/constants/global.constants.js';
import { ASSEMBLY_SENSORS_CONSTANTS } from '../../config/constants/assembly-sensors.constants.js';

let currentPage = PAGINATION.DEFAULT_PAGE;
const pageSize = PAGINATION.DEFAULT_SIZE;

// Debounce mechanism for invalid QR alerts
let invalidQRDebounceTimer = null;
let isInvalidQRAlertShown = false;

/**
 * Check if a field is a duplicate based on duplicate field type and target field
 * @param {string} duplicateField - The type of duplicate detected ('body', 'cap', 'both')
 * @param {string} targetField - The field being checked ('bodyQR' or 'capQR')
 * @returns {boolean} - True if the field is a duplicate
 */
function isDuplicateField(duplicateField, targetField) {
  return (duplicateField === 'body' && targetField === 'bodyQR') || (duplicateField === 'cap' && targetField === 'capQR') || duplicateField === 'both';
}

/**
 * Show debounced invalid QR alert to prevent multiple popups
 * @param {string} qrValue - The invalid QR code value
 */
function showDebouncedInvalidQRAlert(qrValue) {
  // Clear existing timer if any
  if (invalidQRDebounceTimer) {
    clearTimeout(invalidQRDebounceTimer);
  }

  // If alert is already shown, don't show another one
  if (isInvalidQRAlertShown) {
    return;
  }

  // Show the alert
  isInvalidQRAlertShown = true;
  showCustomAlert(`Invalid QR format scanned: ${qrValue}`, () => {
    isInvalidQRAlertShown = false;
    resumeScanning();
  });

  // Set timer to reset the alert flag after debounce time
  invalidQRDebounceTimer = setTimeout(() => {
    isInvalidQRAlertShown = false;
  }, ASSEMBLY_SENSORS_CONSTANTS.INVALID_QR_DEBOUNCE_TIME);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('back-button-assembly').addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.loadHomeScreen) {
      window.electronAPI.loadHomeScreen();
    }
  });

  document.getElementById('saveAssembly').addEventListener('click', async () => {
    const bodyQR = document.getElementById('bodyQR').value.trim();
    const capQR = document.getElementById('capQR').value.trim();

    if (!bodyQR && !capQR) {
      showNotification('Please scan both Body QR and Cap QR.', 'error');
      return;
    } else if (!bodyQR) {
      showNotification('Please scan Body QR code first.', 'error');
      return;
    } else if (!capQR) {
      showNotification('Please scan Cap QR code first.', 'error');
      return;
    }

    // Save the assembly
    if (window.electronAPI && window.electronAPI.saveAssembledSensor) {
      window.electronAPI.saveAssembledSensor({ bodyQR, capQR });
    }
  });

  document.getElementById('resetAssembly').addEventListener('click', () => {
    resetAssemblyForm();
  });

  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      fetchAssembledSensors();
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    currentPage++;
    fetchAssembledSensors();
  });

  fetchAssembledSensors();
  initializeCamera();
});

function fetchAssembledSensors() {
  if (window.electronAPI && window.electronAPI.getAssembledSensors) {
    window.electronAPI.getAssembledSensors({ page: currentPage, size: pageSize }).then(data => {
      const totalPages = Math.ceil(data.totalCount / pageSize);

      // ---- adjust currentPage if it's now out of bounds
      if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
        fetchAssembledSensors(); // recall with adjusted page
        return;
      }

      renderAssembledList(data.rows);

      const prevBtn = document.getElementById('prevPage');
      const nextBtn = document.getElementById('nextPage');
      const pageNumbers = document.getElementById('pageNumbers');

      if (data.totalCount === 0) {
        prevBtn.classList.add('hidden');
        nextBtn.classList.add('hidden');
        pageNumbers.classList.add('hidden');
        return;
      } else {
        prevBtn.classList.remove('hidden');
        nextBtn.classList.remove('hidden');
        pageNumbers.classList.remove('hidden');
      }

      prevBtn.disabled = currentPage === 1;
      prevBtn.classList.toggle('opacity-50', prevBtn.disabled);
      prevBtn.classList.toggle('cursor-not-allowed', prevBtn.disabled);

      nextBtn.disabled = currentPage === totalPages;
      nextBtn.classList.toggle('opacity-50', nextBtn.disabled);
      nextBtn.classList.toggle('cursor-not-allowed', nextBtn.disabled);

      renderPageNumbers(totalPages);
    });
  }
}

function renderAssembledList(list) {
  const tbody = document.getElementById('assembledList');
  tbody.innerHTML = '';

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-neutral-500">No assembled sensors yet.</td>
      </tr>
    `;
    return;
  }

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', item.id);
    tr.innerHTML = `
      <td class="py-2 px-2 text-left">${item.id}</td>
      <td class="py-2 px-2 text-left">${item.bodyQR}</td>
      <td class="py-2 px-2 text-left">${item.capQR}</td>
      <td class="py-2 px-2 text-left">${formatDateTime(item.created_at)}</td>
      <td class="py-2 px-2 text-left">${item.updated_at ? formatDateTime(item.updated_at) : formatDateTime(item.created_at)}</td>
      <td class="py-2 px-2 text-left space-x-2">
        <button
          class="rounded-md bg-red-600 hover:bg-red-700 px-4 py-1 text-white text-sm"
          onclick="deleteSensor(${item.id})"
        >Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function initializeCamera() {
  const video = document.getElementById('video');

  try {
    // Show loading state
    video.style.backgroundColor = '#f3f4f6';
    video.style.display = 'flex';
    video.style.alignItems = 'center';
    video.style.justifyContent = 'center';
    video.innerHTML = '<div style="color: #6b7280; font-size: 14px;">Checking camera...</div>';

    // First check if camera is available
    const cameraCheck = await checkCameraAvailability();

    if (!cameraCheck.success) {
      showCameraErrorModal('🚫 No camera found or permission denied. Please connect a camera and reload.');
      return;
    }

    // Clear loading state
    video.innerHTML = '';
    video.style.backgroundColor = '';

    // If camera is available, start it with error callback
    startCamera(video, handleScannedQR, showCameraErrorModal);
  } catch (error) {
    console.error('Camera initialization failed:', error);
    showCameraErrorModal('🚫 Failed to initialize camera. Please reload the page.');
  }
}

/**
 * Show camera error modal with home navigation option
 * @param {string} message - Error message to display
 */
function showCameraErrorModal(message) {
  const alertBox = document.getElementById('custom-alert');
  const alertMessage = document.getElementById('custom-alert-message');
  const alertOkBtn = document.getElementById('custom-alert-ok');
  const alertCancelBtn = document.getElementById('custom-alert-cancel');

  alertMessage.textContent = message;
  alertOkBtn.textContent = 'OK';

  // Hide cancel button for this modal
  alertCancelBtn.classList.add('hidden');

  alertBox.classList.remove('hidden');

  // Set up home navigation functionality
  alertOkBtn.onclick = () => {
    alertBox.classList.add('hidden');
    if (window.electronAPI && window.electronAPI.loadHomeScreen) {
      window.electronAPI.loadHomeScreen();
    }
  };
}

async function handleScannedQR(qrValue) {
  const bodyQRField = document.getElementById('bodyQR');
  const capQRField = document.getElementById('capQR');

  const capPattern = ASSEMBLY_SENSORS_CONSTANTS.QR_PATTERNS.CAP_PATTERN;
  const bodyPattern = ASSEMBLY_SENSORS_CONSTANTS.QR_PATTERNS.BODY_PATTERN;

  let targetField = null;

  // Pause scanning immediately
  pauseScanning();

  if (capPattern.test(qrValue)) {
    const [, yearStr, weekStr] = qrValue.match(capPattern);
    const week = parseInt(weekStr, 10);
    if (week < ASSEMBLY_SENSORS_CONSTANTS.WEEK_VALIDATION.MIN_WEEK || week > ASSEMBLY_SENSORS_CONSTANTS.WEEK_VALIDATION.MAX_WEEK) {
      showNotification(`Invalid week number in Cap QR: ${week}`, 'error');
      resumeScanning();
      return;
    }
    targetField = 'capQR';
  } else if (bodyPattern.test(qrValue)) {
    targetField = 'bodyQR';
  } else {
    showDebouncedInvalidQRAlert(qrValue);
    return;
  }

  if (document.getElementById(targetField).value.trim()) {
    showCustomAlert(`The ${targetField === 'bodyQR' ? 'Body' : 'Cap'} QR code is already filled.`, () => {
      resumeScanning();
    });
    return;
  }

  // Prepare data to check duplicates
  const bodyQR = targetField === 'bodyQR' ? qrValue : bodyQRField.value.trim();
  const capQR = targetField === 'capQR' ? qrValue : capQRField.value.trim();

  if (window.electronAPI && window.electronAPI.checkDuplicateQR) {
    const duplicateField = await window.electronAPI.checkDuplicateQR({
      bodyQR,
      capQR,
    });

    if (isDuplicateField(duplicateField, targetField)) {
      showCustomAlert(`This ${targetField === 'bodyQR' ? 'Body' : 'Cap'} QR (${targetField === 'bodyQR' ? bodyQR : capQR}) is already saved.`, () => {
        resumeScanning();
      });
      return;
    }
  }

  // If all good, assign value
  document.getElementById(targetField).value = qrValue;

  showCustomAlert(`Scanned ${targetField === 'bodyQR' ? 'Body' : 'Cap'} QR: ${qrValue}`, () => {
    if (!document.getElementById('bodyQR').value.trim() || !document.getElementById('capQR').value.trim()) {
      resumeScanning(); // resume scanning if the other field is still empty
    }
  });
}

// Listen for assembly saved events
if (window.electronAPI && window.electronAPI.onAssembledSaved) {
  window.electronAPI.onAssembledSaved(action => {
    resetAssemblyForm();
    fetchAssembledSensors();

    const message = action === 'deleted' ? 'Assembled sensor deleted successfully.' : 'Sensor assembled successfully.';

    showNotification(message, 'success');
  });
}

function resetAssemblyForm({ body = true, cap = true } = {}) {
  if (body) document.getElementById('bodyQR').value = '';
  if (cap) document.getElementById('capQR').value = '';
  resumeScanning();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopCamera();
  // Clear debounce timer
  if (invalidQRDebounceTimer) {
    clearTimeout(invalidQRDebounceTimer);
    invalidQRDebounceTimer = null;
  }
});

function showCustomAlert(message, onConfirm = null, onCancel = null) {
  const alertBox = document.getElementById('custom-alert');
  const alertMessage = document.getElementById('custom-alert-message');
  const alertOkBtn = document.getElementById('custom-alert-ok');
  const alertCancelBtn = document.getElementById('custom-alert-cancel');

  alertMessage.textContent = message;
  alertOkBtn.textContent = 'OK'; // Reset button text to default
  alertBox.classList.remove('hidden');

  // Show or hide Cancel button
  if (typeof onCancel === 'function') {
    alertCancelBtn.classList.remove('hidden');
  } else {
    alertCancelBtn.classList.add('hidden');
  }

  alertOkBtn.onclick = () => {
    alertBox.classList.add('hidden');
    if (typeof onConfirm === 'function') {
      onConfirm();
      resumeScanning();
    }
  };

  alertCancelBtn.onclick = () => {
    alertBox.classList.add('hidden');
    if (typeof onCancel === 'function') {
      onCancel();
      resumeScanning();
    }
  };
}

function deleteSensor(id) {
  pauseScanning();
  showConfirmationModal(
    'Are you sure you want to delete this sensor?',
    () => {
      // Scroll to top to ensure user sees the success notification
      document.documentElement.scrollTop = 0;

      if (window.electronAPI && window.electronAPI.deleteAssembledSensor) {
        window.electronAPI.deleteAssembledSensor(id);
      }
    },
    () => {
      resumeScanning();
      console.log('Deletion cancelled');
    }
  );
}

function renderPageNumbers(totalPages) {
  const container = document.getElementById('pageNumbers');
  container.innerHTML = '';

  const pages = [];

  if (totalPages <= 7) {
    // show all pages if <=7
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    pages.push(1);

    if (currentPage > 4) {
      pages.push('…');
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 3) {
      pages.push('…');
    }

    pages.push(totalPages);
  }

  pages.forEach(page => {
    const btn = document.createElement('button');
    btn.textContent = page;

    if (page === '…') {
      btn.disabled = true;
      btn.className = 'px-2 py-1 text-gray-500 cursor-default text-sm';
    } else {
      btn.className = 'px-3 py-1 rounded text-sm' + (page === currentPage ? ' bg-neutral-800 text-white font-medium' : ' bg-gray-200 hover:bg-gray-300');

      btn.addEventListener('click', () => {
        currentPage = page;
        fetchAssembledSensors();
      });
    }

    container.appendChild(btn);
  });
}

// Make deleteSensor globally available
window.deleteSensor = deleteSensor;
