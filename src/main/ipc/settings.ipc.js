import { ipcMain } from 'electron';
import path from 'path';
import { getMainWindow } from '../windows/main.js';
import { SettingsController } from '../controllers/settings.controller.js';
import { registerDatabaseIpcHandlers } from './db-ipc.js';
import { getFlukeSettings, saveFlukeSettings, getCommandHistory, clearCommandHistory, getDeveloperSettings, saveDeveloperSettings } from '../db/index.js';
import * as Sentry from '@sentry/electron/main';
let settingsController = null;

/**
 * Helper function to check if controller is initialized
 * @returns {object|null} Error object if not initialized, null if initialized
 */
function checkControllerInitialized() {
  if (!settingsController) {
    return { success: false, error: 'Settings controller not initialized' };
  }
  return null;
}

/**
 * Register all settings-related IPC handlers
 */
export function registerSettingsIpcHandlers() {
  // Register database IPC handlers
  registerDatabaseIpcHandlers();

  // Navigation handler - load settings page
  ipcMain.on('load-settings', async () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Load settings page
      mainWindow.loadFile(path.join('src', 'renderer', 'settings', 'index.html'));

      // Initialize controller when page loads
      mainWindow.webContents.once('did-finish-load', async () => {
        // Clean up existing controller if any
        if (settingsController) {
          await settingsController.cleanup();
        }

        settingsController = new SettingsController(mainWindow);
        await settingsController.initialize();
      });
    }
  });

  // Fluke settings operations - now handled by database functions directly
  ipcMain.handle('settings-get-fluke-settings', async () => {
    try {
      const settings = getFlukeSettings();
      return { success: true, settings };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-ipc', method: 'getFlukeSettings' },
      });
      console.error('Failed to get Fluke settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-save-fluke-settings', async (event, ip, port) => {
    try {
      // Save to database
      const result = saveFlukeSettings(ip, port);

      // Update the TelnetClientService instance if controller is available
      // if (settingsController && settingsController.telnetClient) {
      //   settingsController.telnetClient.updateSettings(ip, port);
      //   console.log(`Updated TelnetClientService with new settings - IP: ${ip}, Port: ${port}`);
      // }

      // // FlukeFactoryService will automatically get updated settings on next use
      // console.log(`FlukeFactoryService will automatically use updated settings on next use - IP: ${ip}, Port: ${port}`);

      if (result.success) {
        // Refresh TelnetClient settings
        const { getTelnetClient } = await import('../services/telnet-client.service.js');
        getTelnetClient().refreshSettings();
      }

      return result;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-ipc', method: 'saveFlukeSettings' },
      });
      console.error('Failed to save Fluke settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Fluke connection operations
  ipcMain.handle('settings-test-fluke-connection', async () => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await settingsController.testFlukeConnection();
  });

  ipcMain.handle('settings-connect-fluke', async () => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await settingsController.connectToFluke();
  });

  ipcMain.handle('settings-disconnect-fluke', async () => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await settingsController.disconnectFromFluke();
  });

  ipcMain.handle('settings-get-fluke-status', async () => {
    const error = checkControllerInitialized();
    if (error) return error;
    return settingsController.getFlukeStatus();
  });

  // Fluke command operations
  ipcMain.handle('settings-send-fluke-command', async (event, command) => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await settingsController.sendFlukeCommand(command);
  });

  // Developer settings operations
  ipcMain.handle('settings-get-developer-settings', async () => {
    try {
      const settings = getDeveloperSettings();
      return { success: true, settings };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-ipc', method: 'getDeveloperSettings' },
      });
      console.error('Failed to get developer settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-save-developer-settings', async (event, settings) => {
    try {
      // Save to database
      const result = saveDeveloperSettings(settings);
      console.log(`Saved developer settings - Mock Fluke: ${settings.mockFlukeEnabled ? 'ENABLED' : 'DISABLED'}`);

      return result;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-ipc', method: 'saveDeveloperSettings' },
      });
      console.error('Failed to save developer settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Developer settings IPC handlers (matching preload API)
  ipcMain.handle('developer-settings-get', async () => {
    try {
      const settings = getDeveloperSettings();
      return { success: true, settings };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-ipc', method: 'developer-settings-get' },
      });
      console.error('Failed to get developer settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('developer-settings-save', async (event, settings) => {
    try {
      // Save to database
      const result = saveDeveloperSettings(settings);
      console.log(`Saved developer settings - Mock Fluke: ${settings.mockFlukeEnabled ? 'ENABLED' : 'DISABLED'}`);

      return result;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-ipc', method: 'developer-settings-save' },
      });
      console.error('Failed to save developer settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('developer-settings-validate-password', async (event, password) => {
    // Simple password validation (you can make this more secure)
    const validPassword = password === 'developer123'; // Change this to your desired password
    return { success: true, valid: validPassword };
  });

  ipcMain.on('developer-settings-go-back', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Navigate back to home screen (main layout)
      mainWindow.loadFile(path.join('src', 'renderer', 'layout', 'index.html'));
    }
  });

  ipcMain.handle('settings-get-command-history', async (event, limit) => {
    try {
      const history = getCommandHistory(limit);
      return { success: true, data: history };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-ipc', method: 'getCommandHistory' },
      });
      console.error('Failed to get command history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings-clear-command-history', async () => {
    try {
      const result = clearCommandHistory();
      return result;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'settings-ipc', method: 'clearCommandHistory' },
      });
      console.error('Failed to clear command history:', error);
      return { success: false, error: error.message };
    }
  });

  // Navigation handlers
  ipcMain.on('settings-go-back', async () => {
    const mainWindow = getMainWindow();

    // Cleanup settings controller and deactivate telnet manager before navigation
    if (settingsController) {
      await settingsController.cleanup();
    }

    if (mainWindow) {
      // Navigate back to home screen (main layout)
      mainWindow.loadFile(path.join('src', 'renderer', 'layout', 'index.html'));
    }
  });

  // Cleanup on app exit
  ipcMain.on('settings-cleanup', async () => {
    if (settingsController) {
      await settingsController.cleanup();
      settingsController = null;
    }
  });
}
