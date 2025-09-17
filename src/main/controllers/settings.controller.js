import { getTelnetClient } from '../services/telnet-client.service.js';
import { COMMAND_HELPERS } from '../constants/fluke-commands.js';
import { addCommandToHistory, getFlukeSettings } from '../db/index.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Controller for managing application settings
 * Handles Fluke configuration and interactive commands
 */
class SettingsController {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.telnetClient = getTelnetClient();

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for telnet client
   */
  setupEventListeners() {
    // Clear any existing UI listeners first to prevent duplicates
    this.telnetClient.clearUIListeners();

    // Store bound handlers for proper cleanup
    this.connectedHandler = data => {
      this.sendToRenderer('fluke-connected', data);
    };

    this.disconnectedHandler = () => {
      this.sendToRenderer('fluke-disconnected');
    };

    this.errorHandler = data => {
      this.sendToRenderer('fluke-error', data);
    };

    this.commandSentHandler = data => {
      this.addToHistory('command', data.command);
      this.sendToRenderer('fluke-command-sent', data);
    };

    this.responseHandler = data => {
      this.addToHistory('response', data.response, data.command);
      this.sendToRenderer('fluke-response', data);
    };

    // Add event listeners
    this.telnetClient.on('connected', this.connectedHandler);
    this.telnetClient.on('disconnected', this.disconnectedHandler);
    this.telnetClient.on('error', this.errorHandler);
    this.telnetClient.on('commandSent', this.commandSentHandler);
    this.telnetClient.on('response', this.responseHandler);
  }

  /**
   * Add entry to command history
   * @param {string} type - 'command' or 'response'
   * @param {string} content - Command or response content
   * @param {string} relatedCommand - Related command for responses
   */
  addToHistory(type, content, relatedCommand = null) {
    addCommandToHistory(type, content, relatedCommand);
  }

  /**
   * Get current Fluke settings
   * @returns {Object} Current settings
   */
  getFlukeSettings() {
    try {
      const settings = getFlukeSettings();
      return { success: true, settings };
    } catch (error) {
      console.error('Failed to get Fluke settings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save Fluke settings
   * @param {string} ip - Fluke IP address
   * @param {string} port - Fluke port
   * @returns {Object} Save result
   */
  async saveFlukeSettings(ip, port) {
    // This will be handled by the IPC layer now
    // Update telnet client settings
    this.telnetClient.updateSettings(ip, port);

    this.sendToRenderer('settings-saved', { ip, port });

    return { success: true, message: 'Use IPC handler for database operations' };
  }

  /**
   * Test Fluke connection
   * @returns {Object} Test result
   */
  async testFlukeConnection() {
    try {
      const result = await this.telnetClient.testConnection();

      this.sendToRenderer('fluke-test-result', result);
      return result;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-controller', method: 'testFlukeConnection' },
      });
      console.error('Error testing Fluke connection:', error);
      const result = { success: false, error: error.message };
      this.sendToRenderer('fluke-test-result', result);
      return result;
    }
  }

  /**
   * Connect to Fluke device
   * @returns {Object} Connection result
   */
  async connectToFluke() {
    try {
      return await this.telnetClient.connect();
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-controller', method: 'connectToFluke' },
      });
      console.error('Error connecting to Fluke:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send command to Fluke device
   * @param {string} command - Command to send
   * @returns {Object} Command result
   */
  async sendFlukeCommand(command) {
    try {
      if (!command || command.trim() === '') {
        return { success: false, error: 'Command cannot be empty' };
      }

      const trimmedCommand = command.trim();

      // Check if command expects a response
      const expectsResponse = COMMAND_HELPERS.expectsResponse(trimmedCommand);

      if (expectsResponse) {
        const response = await this.telnetClient.sendCommand(trimmedCommand);
        return {
          success: true,
          response,
          command: trimmedCommand,
          hasResponse: true,
        };
      } else {
        await this.telnetClient.writeCommand(trimmedCommand + '\n');
        return {
          success: true,
          command: trimmedCommand,
          hasResponse: false,
          message: 'Command sent (no response expected)',
        };
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-controller', method: 'sendFlukeCommand' },
        extra: { command },
      });
      console.error('Error sending Fluke command:', error);
      return {
        success: false,
        error: error.error || error.message,
        command: command,
      };
    }
  }

  /**
   * Get Fluke connection status
   * @returns {Object} Connection status
   */
  getFlukeStatus() {
    return this.telnetClient.getStatus();
  }

  /**
   * Get command history
   * @param {number} limit - Number of entries to return
   * @returns {Array} Command history
   */
  getCommandHistory() {
    // This will be handled by the IPC layer now
    return [];
  }

  /**
   * Clear command history
   * @returns {Object} Clear result
   */
  clearCommandHistory() {
    this.sendToRenderer('command-history-cleared');
    return { success: true, message: 'Use IPC handler for database operations' };
  }

  /**
   * Validate IP address format
   * @param {string} ip - IP address to validate
   * @returns {boolean} True if valid
   */
  isValidIP(ip) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  /**
   * Validate port number
   * @param {string|number} port - Port to validate
   * @returns {boolean} True if valid
   */
  isValidPort(port) {
    const portNum = parseInt(port);
    return Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;
  }

  /**
   * Send message to renderer process
   * @param {string} channel - Channel name
   * @param {*} data - Data to send
   */
  sendToRenderer(channel, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Cleanup controller resources
   */
  async cleanup() {
    // Clear UI event listeners and disconnect
    this.telnetClient.clearUIListeners();
    await this.telnetClient.disconnect();
    console.log('SettingsController: Cleanup completed');
  }

  /**
   * Initialize the controller
   */
  async initialize() {
    try {
      // Load current settings
      const settings = this.getFlukeSettings();

      if (settings.success) {
        this.sendToRenderer('settings-loaded', settings.settings);
      }

      return { success: true };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-controller', method: 'initialize' },
      });
      console.error('Error initializing settings controller:', error);
      return { success: false, error: error.message };
    }
  }
}

export { SettingsController };
