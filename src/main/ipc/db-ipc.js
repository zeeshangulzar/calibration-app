import { ipcMain } from 'electron';
import { getFlukeSettings, saveFlukeSettings, addCommandToHistory, getCommandHistory, clearCommandHistory } from '../db/index.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Validate IP address format
 */
function isValidIP(ip) {
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipRegex.test(ip);
}

/**
 * Validate port number
 */
function isValidPort(port) {
  const portNum = parseInt(port);
  return Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;
}

/**
 * Register database-related IPC handlers
 */
export function registerDatabaseIpcHandlers() {
  registerFlukeSettingsHandlers();
  registerCommandHistoryHandlers();
}

function registerFlukeSettingsHandlers() {
  // Get Fluke settings
  ipcMain.handle('db:get-fluke-settings', async () => {
    try {
      const settings = getFlukeSettings();
      return { success: true, data: settings };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'db-ipc', method: 'getFlukeSettings' },
      });
      console.error('Failed to get Fluke settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Save Fluke settings
  ipcMain.handle('db:save-fluke-settings', async (event, { ip, port }) => {
    try {
      const validationResult = validateFlukeSettings(ip, port);
      if (!validationResult.success) {
        return validationResult;
      }

      const result = saveFlukeSettings(ip, port);
      return result;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'db-ipc', method: 'saveFlukeSettings' },
      });
      console.error('Failed to save Fluke settings:', error);
      return { success: false, error: error.message };
    }
  });
}

function registerCommandHistoryHandlers() {
  // Add command to history
  ipcMain.handle('db:add-command-to-history', async (event, { type, content, relatedCommand }) => {
    try {
      const validationResult = validateCommandHistoryInput(type, content);
      if (!validationResult.success) {
        return validationResult;
      }

      const result = addCommandToHistory(type, content, relatedCommand);
      return result;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'db-ipc', method: 'addCommandToHistory' },
      });
      console.error('Failed to add command to history:', error);
      return { success: false, error: error.message };
    }
  });

  // Get command history
  ipcMain.handle('db:get-command-history', async (event, { limit = 50 }) => {
    try {
      const validationResult = validateHistoryLimit(limit);
      if (!validationResult.success) {
        return validationResult;
      }

      const history = getCommandHistory(validationResult.limit);
      return { success: true, data: history };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'db-ipc', method: 'getCommandHistory' },
      });
      console.error('Failed to get command history:', error);
      return { success: false, error: error.message };
    }
  });

  // Clear command history
  ipcMain.handle('db:clear-command-history', async () => {
    try {
      const result = clearCommandHistory();
      return result;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'db-ipc', method: 'clearCommandHistory' },
      });
      console.error('Failed to clear command history:', error);
      return { success: false, error: error.message };
    }
  });
}

function validateFlukeSettings(ip, port) {
  if (!ip || typeof ip !== 'string') {
    return { success: false, error: 'IP address is required and must be a string' };
  }

  if (!port || typeof port !== 'string') {
    return { success: false, error: 'Port is required and must be a string' };
  }

  if (!isValidIP(ip)) {
    return { success: false, error: 'Invalid IP address format' };
  }

  if (!isValidPort(port)) {
    return { success: false, error: 'Invalid port number (1-65535)' };
  }

  return { success: true };
}

function validateCommandHistoryInput(type, content) {
  if (!type || !['command', 'response'].includes(type)) {
    return { success: false, error: 'Type must be either "command" or "response"' };
  }

  if (!content || typeof content !== 'string') {
    return { success: false, error: 'Content is required and must be a string' };
  }

  return { success: true };
}

function validateHistoryLimit(limit) {
  const limitNum = parseInt(limit);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 1000) {
    return { success: false, error: 'Limit must be a number between 1 and 1000' };
  }

  return { success: true, limit: limitNum };
}
