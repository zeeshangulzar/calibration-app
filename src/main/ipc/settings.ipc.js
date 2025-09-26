import { ipcMain } from 'electron';
import path from 'path';
import { getMainWindow } from '../windows/main.js';
import { SettingsController } from '../controllers/settings.controller.js';
import { registerDatabaseIpcHandlers } from './db-ipc.js';
import { getFlukeSettings, saveFlukeSettings, getCommandHistory, clearCommandHistory } from '../db/index.js';
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
      const result = saveFlukeSettings(ip, port);

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

/**
 * Cleanup settings resources (called on app quit)
 */
export async function cleanupSettings() {
  if (settingsController) {
    try {
      console.log('Cleaning up Settings on app quit...');
      await settingsController.cleanup();
      settingsController = null;
      console.log('Settings cleanup completed');
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error during Settings cleanup on app quit:', error);
    }
  }
}
