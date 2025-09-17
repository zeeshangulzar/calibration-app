import { formatTime } from '../../shared/helpers/date-helper.js';
/**
 * Settings Page JavaScript
 * Handles Fluke configuration and interactive commands
 */

// State management
let isConnected = false;
let commandHistory = [];

// DOM elements
let elements = {};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  setupEventListeners();
  loadSettings();
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
  elements = {
    // Navigation
    backButton: document.getElementById('back-button'),

    // Form elements
    flukeSettingsForm: document.getElementById('fluke-settings-form'),
    flukeIpInput: document.getElementById('fluke-ip'),
    flukePortInput: document.getElementById('fluke-port'),
    testConnectionBtn: document.getElementById('test-connection-btn'),

    // Command interface
    commandInput: document.getElementById('command-input'),
    sendCommandBtn: document.getElementById('send-command-btn'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    commandHistoryDiv: document.getElementById('command-history'),

    // Quick commands
    quickCommandBtns: document.querySelectorAll('[data-command]'),

    // UI elements
    notificationContainer: document.getElementById('notification-container'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
  };
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Navigation
  elements.backButton.addEventListener('click', goBack);

  // Form submission
  elements.flukeSettingsForm.addEventListener('submit', handleSaveSettings);

  // Connection buttons
  elements.testConnectionBtn.addEventListener('click', testConnection);

  // Command interface
  elements.sendCommandBtn.addEventListener('click', sendCommand);
  elements.clearHistoryBtn.addEventListener('click', clearCommandHistory);
  elements.commandInput.addEventListener('keypress', handleCommandInputKeyPress);

  // Quick commands
  elements.quickCommandBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const command = btn.dataset.command;
      elements.commandInput.value = command;
      sendCommand();
    });
  });

  // Real-time validation
  elements.flukeIpInput.addEventListener('input', validateForm);
  elements.flukePortInput.addEventListener('input', validateForm);

  // Electron API event listeners
  setupElectronEventListeners();
}

/**
 * Setup Electron API event listeners
 */
function setupElectronEventListeners() {
  // Settings events
  window.electronAPI.onSettingsLoaded(settings => {
    elements.flukeIpInput.value = settings.fluke_ip || '';
    elements.flukePortInput.value = settings.fluke_port || '';
    validateForm();
  });

  window.electronAPI.onSettingsSaved(() => {
    showNotification('Settings saved successfully', 'success');
  });

  // Fluke connection events
  window.electronAPI.onFlukeConnected(data => {
    isConnected = true;
    showNotification(`Connected to Fluke at ${data.host}:${data.port}`, 'success');
    hideLoading();
  });

  window.electronAPI.onFlukeDisconnected(() => {
    isConnected = false;
    showNotification('Disconnected from Fluke device', 'info');
    hideLoading();
  });

  window.electronAPI.onFlukeError(data => {
    isConnected = false;
    showNotification(`Fluke error: ${data.error}`, 'error');
    hideLoading();
  });

  window.electronAPI.onFlukeTestResult(result => {
    if (result.success) {
      showNotification(`Connection test successful: ${result.response || result.message}`, 'success');
    } else {
      showNotification(`Connection test failed: ${result.error}`, 'error');
    }
    hideLoading();
  });

  // Command events
  window.electronAPI.onFlukeCommandSent(data => {
    addCommandToHistory('command', data.command);
  });

  window.electronAPI.onFlukeResponse(data => {
    addCommandToHistory('response', data.response, data.command);
  });

  window.electronAPI.onCommandHistoryCleared(() => {
    commandHistory = [];
    updateCommandHistoryDisplay();
    showNotification('Command history cleared', 'info');
  });

  // Handle notifications from main process
  window.electronAPI.onShowNotification(data => {
    const { type, message } = data;

    // Use the existing showNotification function
    showNotification(message, type);

    // Also log to console for debugging
    console.log(`[Notification ${type.toUpperCase()}] ${message}`);
  });
}

/**
 * Load current settings
 */
async function loadSettings() {
  try {
    const result = await window.electronAPI.getFlukeSettings();
    if (result.success) {
      elements.flukeIpInput.value = result.settings.fluke_ip || '';
      elements.flukePortInput.value = result.settings.fluke_port || '';
      validateForm();
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showNotification('Failed to load settings', 'error');
  }
}

/**
 * Handle save settings form submission
 */
async function handleSaveSettings(event) {
  event.preventDefault();

  const ip = elements.flukeIpInput.value.trim();
  const port = elements.flukePortInput.value.trim();

  if (!validateInputs(ip, port)) {
    return;
  }

  showLoading('Saving settings...');

  try {
    const result = await window.electronAPI.saveFlukeSettings(ip, port);

    if (result.success) {
      showNotification('Settings saved successfully', 'success');
    } else {
      showNotification(`Failed to save settings: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    showNotification('Error saving settings', 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Test Fluke connection
 */
async function testConnection() {
  showLoading('Testing connection...');

  try {
    await window.electronAPI.testFlukeConnection();
  } catch (error) {
    console.error('Error testing connection:', error);
    showNotification('Error testing connection', 'error');
    hideLoading();
  }
}

/**
 * Send command to Fluke device (auto-connect if needed)
 */
async function sendCommand() {
  const command = elements.commandInput.value.trim();

  if (!command) {
    showNotification('Please enter a command', 'error');
    return;
  }

  // Disable send button temporarily
  elements.sendCommandBtn.disabled = true;
  elements.sendCommandBtn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-white mr-2"></div>Sending...';

  try {
    // Try to send command (service will handle connection automatically)
    const result = await window.electronAPI.sendFlukeCommand(command);

    if (result.success) {
      // Clear input on successful send
      elements.commandInput.value = '';

      // Update connection state if we weren't connected before
      if (!isConnected) {
        isConnected = true;
        showNotification('Connected to Fluke and command sent successfully', 'success');
      } else {
        showNotification('Command sent successfully', 'success');
      }

      // If no response expected, add a note
      if (!result.hasResponse) {
        addCommandToHistory('info', 'Command sent (no response expected)');
      }
    } else {
      showNotification(`Command failed: ${result.error}`, 'error');
      addCommandToHistory('error', `Error: ${result.error}`, command);
    }
  } catch (error) {
    console.error('Error sending command:', error);
    showNotification('Error sending command', 'error');
    addCommandToHistory('error', `Error: ${error.message}`, command);
  } finally {
    // Re-enable send button
    elements.sendCommandBtn.disabled = false;
    elements.sendCommandBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Send';
  }
}

/**
 * Handle command input key press
 */
function handleCommandInputKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendCommand();
  }
}

/**
 * Clear command history
 */
async function clearCommandHistory() {
  try {
    await window.electronAPI.clearCommandHistory();
  } catch (error) {
    console.error('Error clearing command history:', error);
    showNotification('Error clearing command history', 'error');
  }
}

/**
 * Add command or response to history
 */
async function addCommandToHistory(type, content, relatedCommand = null) {
  // Add to local display immediately
  const entry = {
    type,
    content,
    relatedCommand,
    timestamp: new Date().toISOString(),
  };

  commandHistory.unshift(entry);

  // Keep history manageable
  if (commandHistory.length > 100) {
    commandHistory = commandHistory.slice(0, 100);
  }

  updateCommandHistoryDisplay();

  // Also save to database
  try {
    await window.electronAPI.db.addCommandToHistory(type, content, relatedCommand);
  } catch (error) {
    console.error('Failed to save command to database:', error);
  }
}

/**
 * Update command history display
 */
function updateCommandHistoryDisplay() {
  if (commandHistory.length === 0) {
    elements.commandHistoryDiv.innerHTML = `
      <div class="text-gray-400 text-center py-16">
        Command history will appear here...
        <br>
        <small class="text-xs">Connect to Fluke device to start sending commands</small>
      </div>
    `;
    return;
  }

  const historyHtml = commandHistory
    .map(entry => {
      const timestamp = formatTime(entry.timestamp);
      let entryClass = '';
      let icon = '';

      switch (entry.type) {
        case 'command':
          entryClass = 'text-blue-300';
          icon = '>';
          break;
        case 'response':
          entryClass = 'text-green-300 ml-4';
          icon = '<';
          break;
        case 'error':
          entryClass = 'text-red-300';
          icon = '!';
          break;
        case 'info':
          entryClass = 'text-green-300 ml-4';
          icon = 'i';
          break;
      }

      return `
      <div class="mb-2 py-1">
        <span class="text-gray-400 text-xs">[${timestamp}]</span>
        <span class="${entryClass}"> ${icon} ${entry.content}</span>
      </div>
    `;
    })
    .join('');

  elements.commandHistoryDiv.innerHTML = historyHtml;

  // Auto-scroll to bottom
  elements.commandHistoryDiv.scrollTop = elements.commandHistoryDiv.scrollHeight;
}

/**
 * Validate form inputs
 */
function validateForm() {
  const ip = elements.flukeIpInput.value.trim();
  const port = elements.flukePortInput.value.trim();

  const isValid = validateInputs(ip, port, false);

  // Update form button states
  const saveBtn = elements.flukeSettingsForm.querySelector('button[type="submit"]');
  saveBtn.disabled = !isValid;
  elements.testConnectionBtn.disabled = !isValid;

  return isValid;
}

/**
 * Validate IP and port inputs
 */
function validateInputs(ip, port, showErrors = true) {
  let isValid = true;

  // Validate IP address
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ip || !ipRegex.test(ip)) {
    if (showErrors) {
      showNotification('Please enter a valid IP address', 'error');
    }
    elements.flukeIpInput.classList.remove('border-gray-300', 'focus:border-indigo-500');
    elements.flukeIpInput.classList.add('border-red-500', 'focus:border-red-500');
    isValid = false;
  } else {
    elements.flukeIpInput.classList.remove('border-red-500', 'focus:border-red-500');
    elements.flukeIpInput.classList.add('border-gray-300', 'focus:border-indigo-500');
  }

  // Validate port number
  const portNum = parseInt(port);
  if (!port || isNaN(portNum) || portNum < 1 || portNum > 65535) {
    if (showErrors) {
      showNotification('Please enter a valid port number (1-65535)', 'error');
    }
    elements.flukePortInput.classList.remove('border-gray-300', 'focus:border-indigo-500');
    elements.flukePortInput.classList.add('border-red-500', 'focus:border-red-500');
    isValid = false;
  } else {
    elements.flukePortInput.classList.remove('border-red-500', 'focus:border-red-500');
    elements.flukePortInput.classList.add('border-gray-300', 'focus:border-indigo-500');
  }

  return isValid;
}

/**
 * Show floating notification (toast style)
 */
function showNotification(message, type = 'info') {
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

  elements.notificationContainer.appendChild(notification);

  // Trigger entrance animation
  setTimeout(() => {
    notification.classList.remove('translate-x-full', 'opacity-0');
    notification.classList.add('translate-x-0', 'opacity-100');
  }, 50);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }
  }, 5000);
}

/**
 * Show loading overlay
 */
function showLoading(text = 'Processing...') {
  elements.loadingText.textContent = text;
  elements.loadingOverlay.classList.remove('hidden');
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

/**
 * Navigate back to previous page
 */
function goBack() {
  window.electronAPI.settingsGoBack();
}
