import { ipcMain } from 'electron';
import { getMainWindow } from '../windows/main.js';
import { GVIController } from '../controllers/gvi.controller.js';
import * as Sentry from '@sentry/electron/main';
import path from 'path';

let gviController = null;

/**
 * Generic handler wrapper for error handling and controller validation
 */
const createHandler = (handlerName, requiresController = true) => async (event, ...args) => {
  try {
    if (requiresController && !gviController) {
      return { success: false, error: 'GVI Flow Meter not initialized' };
    }

    const handlerFunction = handlers[handlerName];
    if (!handlerFunction) {
      throw new Error(`Handler ${handlerName} not found`);
    }

    return await handlerFunction(event, ...args);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { ipc: 'gvi', handler: handlerName },
      extra: { args },
    });
    console.error(`Error in ${handlerName}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Handler functions
 */
const handlers = {
  async loadGVI(event) {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    mainWindow.loadFile(path.join('src', 'renderer', 'gvi-flow-meter', 'index.html'));

    mainWindow.webContents.once('did-finish-load', async () => {
      // Clean up existing controller if any
      if (gviController) {
        await gviController.cleanup();
      }

      // Initialize new controller
      gviController = new GVIController(mainWindow);
      await gviController.initialize();
    });
  },

  async gviGoBack(event) {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Clean up controller before navigation
      if (gviController) {
        await gviController.cleanup();
        gviController = null;
      }
      mainWindow.loadFile(path.join('src', 'renderer', 'layout', 'index.html'));
    }
  },

  async startCalibration(event, config) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.startCalibration(config);
  },

  async stopCalibration(event) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.stopCalibration();
  },

  async getStatus(event) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return gviController.getStatus();
  },

  async updateStep(event, stepData) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.updateStep(stepData);
  },

  async getAvailableModels(event) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.getAvailableModels();
  },

  async getCalibrationSteps(event, model) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.getCalibrationSteps(model);
  },
};

/**
 * Register all GVI Flow Meter related IPC handlers
 */
export function registerGVIIpcHandlers() {
  // Navigation handlers
  ipcMain.on('load-gvi', createHandler('loadGVI', false));
  ipcMain.on('gvi-go-back', createHandler('gviGoBack', false));

  // Calibration handlers
  ipcMain.handle('gvi-start-calibration', createHandler('startCalibration'));
  ipcMain.handle('gvi-stop-calibration', createHandler('stopCalibration'));
  ipcMain.handle('gvi-get-status', createHandler('getStatus'));
  ipcMain.handle('gvi-update-step', createHandler('updateStep'));
  
  // Data handlers
  ipcMain.handle('gvi-get-available-models', createHandler('getAvailableModels'));
  ipcMain.handle('gvi-get-calibration-steps', createHandler('getCalibrationSteps'));
}

/**
 * Cleanup function for GVI module
 */
export async function cleanupGVI() {
  try {
    if (gviController) {
      await gviController.cleanup();
      gviController = null;
    }
  } catch (error) {
    console.error('Error cleaning up GVI:', error);
    Sentry.captureException(error);
  }
}
