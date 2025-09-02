import { GLOBAL_CONSTANTS } from '../../config/constants/global.constants.js';

function showCustomAlertModal(message) {
  const alertBox = document.getElementById('custom-alert');
  const alertMessage = document.getElementById('custom-alert-message');
  const alertOkBtn = document.getElementById('custom-alert-ok');
  alertMessage.textContent = message;
  alertBox.classList.remove('hidden');
  alertOkBtn.onclick = () => alertBox.classList.add('hidden');
}

function showError(message) {
  const errorAlert = document.getElementById('error-alert');
  const errorMessage = document.getElementById('error-message');

  if (errorAlert && errorMessage) {
    errorMessage.textContent = message;
    errorAlert.classList.remove('hidden');
  }
}

// Show info message (placeholder for future implementation)
function showInfo(message) {
  showNotification(message, 'info');
}

function showSuccess(message) {
  showNotification(message, 'success');
}

// Simple notification function
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 px-4 py-2 rounded-md shadow-lg text-white z-50 transition-all duration-300 ${
    type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600'
  }`;
  notification.textContent = message;

  // Add to body
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, GLOBAL_CONSTANTS.NOTIFICATION_TIMEOUT);
}

export { showCustomAlertModal, showError, showInfo, showSuccess, showNotification };
