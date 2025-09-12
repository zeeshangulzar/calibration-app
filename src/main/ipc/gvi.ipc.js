import { ipcMain } from 'electron';
import { getMainWindow } from '../windows/main.js';
import { GVIController } from '../controllers/gvi.controller.js';
import * as Sentry from '@sentry/electron/main';
import path from 'path';

let gviController = null;

/**
 * Generic handler wrapper for error handling and controller validation
 */
const createHandler =
  (handlerName, requiresController = true) =>
  async (event, ...args) => {
    try {
      console.log(`GVI IPC: createHandler called for ${handlerName}, requiresController: ${requiresController}`);

      if (requiresController && !gviController) {
        console.log(`GVI IPC: Controller required but not initialized for ${handlerName}`);
        return { success: false, error: 'GVI Flow Meter not initialized' };
      }

      const handlerFunction = handlers[handlerName];
      if (!handlerFunction) {
        console.error(`GVI IPC: Handler ${handlerName} not found in handlers object`);
        console.log('Available handlers:', Object.keys(handlers));
        throw new Error(`Handler ${handlerName} not found`);
      }

      console.log(`GVI IPC: Calling handler ${handlerName}`);
      return await handlerFunction(event, ...args);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { ipc: 'gvi', handler: handlerName },
        extra: { args },
      });
      console.error(`GVI IPC Error in ${handlerName}:`, error);
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

    // Clean up existing controller if any
    if (gviController) {
      await gviController.cleanup();
    }

    // Initialize controller before loading the page
    gviController = new GVIController(mainWindow);
    await gviController.initialize();

    mainWindow.loadFile(path.join('src', 'renderer', 'gvi-flow-meter', 'index.html'));
  },

  async gviGoBack(event) {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Call controller goBack method to handle calibration stopping and Fluke zero pressure
      if (gviController) {
        try {
          await gviController.goBack();
        } catch (error) {
          console.error('Error during GVI goBack:', error);
        }
        // Clean up controller after goBack
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
    console.log('IPC getAvailableModels called, controller exists:', !!gviController);
    if (!gviController) {
      console.log('GVI controller not initialized, returning error');
      return { success: false, error: 'GVI controller not initialized' };
    }
    const result = await gviController.getAvailableModels();
    console.log('IPC getAvailableModels result:', result);
    return result;
  },

  async getCalibrationSteps(event, model) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.getCalibrationSteps(model);
  },

  async runFlukePrereqs(event) {
    console.log('GVI IPC: runFlukePrereqs called, controller exists:', !!gviController);
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.runFlukePrereqs();
  },

  async setPressure(event, psi) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.setPressure(psi);
  },

  async generatePDF(event, calibrationData) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.generatePDF(calibrationData);
  },

  async openPDF(event, pdfPath) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.openPDF(pdfPath);
  },

  async refreshFlukeService(event) {
    if (!gviController) {
      return { success: false, error: 'GVI controller not initialized' };
    }
    return await gviController.refreshFlukeService();
  },
};

/**
 * Register all GVI Flow Meter related IPC handlers
 */
export function registerGVIIpcHandlers() {
  console.log('Registering GVI IPC handlers...');

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
  ipcMain.handle('gvi-run-fluke-prereqs', createHandler('runFlukePrereqs'));
  ipcMain.handle('gvi-set-pressure', createHandler('setPressure'));
  ipcMain.handle('gvi-generate-pdf', createHandler('generatePDF'));
  ipcMain.handle('gvi-open-pdf', createHandler('openPDF'));
  ipcMain.handle('gvi-refresh-fluke-service', createHandler('refreshFlukeService'));

  console.log('GVI IPC handlers registered successfully');
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
