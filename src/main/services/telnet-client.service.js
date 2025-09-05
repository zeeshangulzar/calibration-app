import net from 'net';
import EventEmitter from 'events';
import { getFlukeSettings } from '../db/index.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Enhanced Telnet Client for Fluke communication
 * Supports interactive command sending and response handling
 */
class TelnetClientService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isConnected = false;
    this.host = null;
    this.port = null;
    this.responseTimeout = 5000; // 5 seconds
    this.autoReconnect = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;

    this.loadSettings();

    // Add error listener to prevent unhandled errors from crashing the app
    this.on('error', error => {
      console.error('TelnetClient error event:', error);
      // Don't re-throw the error to prevent app crash
    });
  }

  /**
   * Load settings from database
   */
  loadSettings() {
    try {
      const settings = getFlukeSettings();
      this.host = settings.fluke_ip;
      this.port = parseInt(settings.fluke_port);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'telnet-client', method: 'loadFlukeSettings' }
      });
      console.error('Failed to load Fluke settings:', error);
      this.host = '10.10.69.27';
      this.port = 3490;
    }
  }

  /**
   * Update connection settings
   * @param {string} host - Host IP address
   * @param {number} port - Port number
   */
  updateSettings(host, port) {
    this.host = host;
    this.port = parseInt(port);

    // Reconnect if currently connected
    if (this.isConnected) {
      this.disconnect();
      setTimeout(() => this.connect(), 1000);
    }
  }

  /**
   * Connect to Fluke device
   * @returns {Promise<Object>} Connection result
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve({ success: true, message: 'Already connected' });
        return;
      }

      // Clean up any existing client
      if (this.client) {
        this.client.removeAllListeners();
        this.client.destroy();
      }

      this.client = new net.Socket();

      // Connection successful
      this.client.connect(this.port, this.host, () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;

        const message = `Connected to Fluke at ${this.host}:${this.port}`;
        console.log(message);

        this.emit('connected', { host: this.host, port: this.port });
        resolve({ success: true, message });
      });

      // Error handler
      this.client.on('error', error => {
        this.isConnected = false;

        const errorMessage = `Connection error: ${error.message}`;
        console.error(errorMessage);

        // Emit error event but don't let it crash the app
        this.emit('error', { error: error.message, host: this.host, port: this.port });

        if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }

        reject({ success: false, error: errorMessage });
      });

      // Close handler
      this.client.on('close', () => {
        this.isConnected = false;
        console.log('Fluke connection closed');

        this.emit('disconnected');

        if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      });

      // Timeout handler
      this.client.on('timeout', () => {
        console.log('Fluke connection timeout');
        this.isConnected = false;
        this.client.destroy();

        // Emit timeout event
        this.emit('timeout', { host: this.host, port: this.port });

        // Reject the connection promise
        reject({ success: false, error: 'Connection timeout' });
      });
    });
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // Exponential backoff

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Send command to Fluke and wait for response
   * @param {string} command - Command to send
   * @param {number} timeout - Response timeout (optional)
   * @returns {Promise<string>} Response from Fluke
   */
  sendCommand(command, timeout = this.responseTimeout) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.client) {
        reject({ success: false, error: 'Not connected to Fluke device' });
        return;
      }

      console.log(`Sending command: ${command}`);

      // Set up response timeout
      const responseTimer = setTimeout(() => {
        this.client.removeListener('data', responseHandler);
        reject({ success: false, error: 'Fluke is Busy: Response timed out' });
      }, timeout);

      // Response handler
      const responseHandler = data => {
        clearTimeout(responseTimer);
        this.client.removeListener('data', responseHandler);

        const response = data.toString().trim();
        console.log(`Received response: ${response}`);

        this.emit('response', { command, response });
        resolve(response);
      };

      // Listen for response
      this.client.once('data', responseHandler);

      // Send command
      try {
        this.client.write(command + '\n');
        this.emit('commandSent', { command });
      } catch (error) {
        Sentry.captureException(error, {
          tags: { service: 'telnet-client', method: 'sendCommand' },
          extra: { command }
        });
        clearTimeout(responseTimer);
        this.client.removeListener('data', responseHandler);
        reject({ success: false, error: `Failed to send command: ${error.message}` });
      }
    });
  }

  /**
   * Send raw command without waiting for response
   * @param {string} command - Command to send
   * @returns {Promise<Object>} Send result
   */
  writeCommand(command) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.client) {
        reject({ success: false, error: 'Not connected to Fluke device' });
        return;
      }

      try {
        this.client.write(command);
        this.emit('commandSent', { command });
        resolve({ success: true, message: 'Command sent' });
      } catch (error) {
        Sentry.captureException(error, {
          tags: { service: 'telnet-client', method: 'sendRawCommand' },
          extra: { command }
        });
        reject({ success: false, error: `Failed to send command: ${error.message}` });
      }
    });
  }

  /**
   * Test connection with identification command
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const response = await this.sendCommand('*IDN?');
      return {
        success: true,
        message: 'Connection test successful',
        response,
        device: response,
      };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'telnet-client', method: 'testConnection' }
      });
      return {
        success: false,
        error: error.error || error.message || 'Connection test failed',
      };
    }
  }

  /**
   * Get connection status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      host: this.host,
      port: this.port,
      reconnectAttempts: this.reconnectAttempts,
      autoReconnect: this.autoReconnect,
    };
  }

  /**
   * Enable/disable auto-reconnect
   * @param {boolean} enabled - Auto-reconnect enabled
   */
  setAutoReconnect(enabled) {
    this.autoReconnect = enabled;
  }

  /**
   * Disconnect from Fluke device
   * @returns {Promise<Object>} Disconnect result
   */
  disconnect() {
    return new Promise(resolve => {
      if (!this.client || !this.isConnected) {
        resolve({ success: true, message: 'Already disconnected' });
        return;
      }

      this.autoReconnect = false; // Prevent auto-reconnect during manual disconnect

      this.client.removeAllListeners();
      this.client.end(() => {
        this.client.destroy();
        this.isConnected = false;
        console.log('Disconnected from Fluke device');
        resolve({ success: true, message: 'Disconnected successfully' });
      });

      // Force disconnect after timeout
      setTimeout(() => {
        if (this.client) {
          this.client.destroy();
          this.isConnected = false;
        }
        resolve({ success: true, message: 'Force disconnected' });
      }, 2000);
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await this.disconnect();
    this.removeAllListeners();
  }
}

// Singleton instance
let telnetClientInstance = null;

export function getTelnetClient() {
  if (!telnetClientInstance) {
    telnetClientInstance = new TelnetClientService();
  }
  return telnetClientInstance;
}

export { TelnetClientService };
