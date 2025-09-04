// Developer Settings Page - Optimized
import { showNotification } from '../../shared/helpers/notification-helper.js';

class DeveloperSettings {
  constructor() {
    this.elements = {
      passwordContainer: document.getElementById('password-container'),
      settingsContainer: document.getElementById('settings-container'),
      passwordForm: document.getElementById('password-form'),
      passwordInput: document.getElementById('password-input'),
      settingsForm: document.getElementById('settings-form'),
      mockFlukeCheckbox: document.getElementById('mock-fluke-checkbox'),
      backButton: document.getElementById('back-button'),
    };

    this.isAuthenticated = false;
    this.init();
  }

  init() {
    // Password form submission
    this.elements.passwordForm.addEventListener('submit', e => {
      e.preventDefault();
      this.handlePasswordSubmit();
    });

    // Settings form submission
    this.elements.settingsForm.addEventListener('submit', e => {
      e.preventDefault();
      this.handleSaveSettings();
    });

    // Back button
    this.elements.backButton.addEventListener('click', () => window.electronAPI.developerSettingsGoBack());

    // Toggle switch functionality
    this.elements.mockFlukeCheckbox.addEventListener('change', () => this.updateToggleAppearance());
    this.updateToggleAppearance();
  }

  updateToggleAppearance() {
    const checkbox = this.elements.mockFlukeCheckbox;
    const background = checkbox.parentElement.querySelector('.w-10');
    const slider = checkbox.parentElement.querySelector('.absolute');
    const isChecked = checkbox.checked;

    background.classList.toggle('bg-black', isChecked);
    background.classList.toggle('bg-gray-200', !isChecked);
    slider.classList.toggle('transform', isChecked);
    slider.classList.toggle('translate-x-4', isChecked);
  }

  async handlePasswordSubmit() {
    const password = this.elements.passwordInput.value.trim();
    if (!password) return showNotification('Please enter a password', 'error');

    try {
      const isValid = await window.electronAPI.validateDeveloperPassword(password);
      if (isValid) {
        this.isAuthenticated = true;
        this.elements.passwordContainer.classList.add('hidden');
        this.elements.settingsContainer.classList.remove('hidden');
        this.loadDeveloperSettings();
      } else {
        showNotification('Password is incorrect', 'error');
        this.elements.passwordInput.value = '';
      }
    } catch (error) {
      console.error('Error validating password:', error);
      showNotification('Error validating password. Please try again.', 'error');
    }
  }

  async loadDeveloperSettings() {
    try {
      const result = await window.electronAPI.getDeveloperSettings();
      this.elements.mockFlukeCheckbox.checked = result?.success ? result.settings.mockFlukeEnabled || false : false;
      this.updateToggleAppearance();
    } catch (error) {
      console.error('Error loading developer settings:', error);
      showNotification('Error loading settings', 'error');
    }
  }

  async handleSaveSettings() {
    try {
      const result = await window.electronAPI.saveDeveloperSettings({
        mockFlukeEnabled: this.elements.mockFlukeCheckbox.checked,
      });

      showNotification(result.success ? 'Developer settings saved successfully' : `Failed to save settings: ${result.error}`, result.success ? 'success' : 'error');
    } catch (error) {
      console.error('Error saving developer settings:', error);
      showNotification('Error saving settings. Please try again.', 'error');
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => new DeveloperSettings());
