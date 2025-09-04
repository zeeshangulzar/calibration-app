import { ipcMain } from 'electron';
import { getMainWindow } from '../windows/main.js';
import { getDeveloperSettings, saveDeveloperSettings } from '../db/index.js';
import * as Sentry from '@sentry/electron/main';
import path from 'path';

/**
 * Register all developer settings related IPC handlers
 */
export function registerDeveloperSettingsIpcHandlers() {
  // Password validation - using password from environment variable
  ipcMain.handle('developer-settings-validate-password', async (event, password) => {
    try {
      // Get developer password from environment variable, fallback to default

      const correctPassword = process.env.DEVELOPER_PASSWORD || 'dev123';
      return password === correctPassword;
    } catch (error) {
      console.error('Error validating developer password:', error);
      Sentry.captureException(error);
      return false;
    }
  });

  // Get developer settings
  ipcMain.handle('developer-settings-get', async () => {
    try {
      const settings = getDeveloperSettings();
      return {
        success: true,
        settings: settings,
      };
    } catch (error) {
      console.error('Error getting developer settings:', error);
      Sentry.captureException(error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Save developer settings
  ipcMain.handle('developer-settings-save', async (event, settings) => {
    try {
      const result = saveDeveloperSettings(settings);
      return result;
    } catch (error) {
      console.error('Error saving developer settings:', error);
      Sentry.captureException(error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Navigation back to home screen
  ipcMain.on('developer-settings-go-back', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.loadFile(path.join('src', 'renderer', 'layout', 'index.html'));
    }
  });
}
