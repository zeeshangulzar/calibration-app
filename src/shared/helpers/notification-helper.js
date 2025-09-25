import { GLOBAL_CONSTANTS } from '../../config/constants/global.constants.js';

function showCustomAlertModal(message) {
  const alertBox = document.getElementById('custom-alert');
  const alertMessage = document.getElementById('custom-alert-message');
  const alertOkBtn = document.getElementById('custom-alert-ok');
  alertMessage.textContent = message;
  alertBox.classList.remove('hidden');
  alertOkBtn.onclick = () => alertBox.classList.add('hidden');
}

function showConfirmationModal(message, onConfirm = null, onCancel = null) {
  const alertBox = document.getElementById('custom-alert');
  const alertMessage = document.getElementById('custom-alert-message');
  const alertOkBtn = document.getElementById('custom-alert-ok');
  const alertCancelBtn = document.getElementById('custom-alert-cancel');

  alertMessage.innerHTML = message;
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
    }
  };

  alertCancelBtn.onclick = () => {
    alertBox.classList.add('hidden');
    if (typeof onCancel === 'function') {
      onCancel();
    }
  };
}

function showError(message) {
  const errorAlert = document.getElementById('error-alert');
  const errorMessage = document.getElementById('error-message');

  if (errorAlert && errorMessage) {
    // Ensure we never show undefined, null, or empty messages
    const displayMessage = message && typeof message === 'string' && message.trim() ? message.trim() : 'An unexpected error occurred. Please try again.';

    errorMessage.textContent = displayMessage;
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

// Enhanced notification function with fluke settings page styling
function showNotification(message, type = 'info') {
  // Ensure notification container exists
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'fixed top-4 right-4 z-50 space-y-2';
    document.body.appendChild(container);
  }

  // Create notification element
  const notification = document.createElement('div');

  // Determine colors and icon based on type
  let bgColor = '';
  let borderColor = '';
  let textColor = '';
  let icon = '';

  switch (type) {
    case 'success':
      bgColor = 'bg-green-100';
      borderColor = 'border-green-500';
      textColor = 'text-green-800';
      icon = 'fas fa-check-circle text-green-600';
      break;
    case 'error':
      bgColor = 'bg-red-100';
      borderColor = 'border-red-500';
      textColor = 'text-red-800';
      icon = 'fas fa-exclamation-circle text-red-600';
      break;
    case 'info':
      bgColor = 'bg-blue-100';
      borderColor = 'border-blue-500';
      textColor = 'text-blue-800';
      icon = 'fas fa-info-circle text-blue-600';
      break;
    default:
      bgColor = 'bg-gray-100';
      borderColor = 'border-gray-500';
      textColor = 'text-gray-800';
      icon = 'fas fa-info-circle text-gray-600';
  }

  notification.className = `${bgColor} ${borderColor} ${textColor} border-l-4 p-4 rounded-r-lg shadow-lg max-w-sm transform transition-all duration-300 ease-in-out translate-x-full opacity-0`;

  notification.innerHTML = `
    <div class="flex items-start">
      <div class="flex-shrink-0">
        <i class="${icon} text-lg"></i>
      </div>
      <div class="ml-3 flex-1">
        <p class="text-sm font-medium">${message}</p>
      </div>
      <div class="flex-shrink-0 ml-4">
        <button onclick="this.parentElement.parentElement.parentElement.remove()" class="text-lg leading-none hover:opacity-70 ${textColor}">&times;</button>
      </div>
    </div>
  `;

  container.appendChild(notification);

  // Trigger entrance animation
  setTimeout(() => {
    notification.classList.remove('translate-x-full', 'opacity-0');
    notification.classList.add('translate-x-0', 'opacity-100');
  }, 50);

  // Auto-remove after timeout
  setTimeout(() => {
    notification.classList.remove('translate-x-0', 'opacity-100');
    notification.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, GLOBAL_CONSTANTS.NOTIFICATION_TIMEOUT);
}

export { showCustomAlertModal, showConfirmationModal, showError, showInfo, showSuccess, showNotification };
