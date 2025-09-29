import { ipcMain } from 'electron';
import { getMainWindow } from '../windows/main.js';
import { GVIController } from '../controllers/gvi.controller.js';
import { gviReportsDb } from '../db/gvi-reports.db.js';
import { sentryLogger } from '../loggers/sentry.logger.js';
import path from 'path';

let gviController = null;

/**
 * Generic handler wrapper for error handling and controller validation
 */
const createHandler =
  (handlerName, requiresController = true) =>
  async (event, ...args) => {
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
      sentryLogger.handleError(error, {
        module: 'GVI_IPC',
        method: handlerName,
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
      if (gviController) {
        await gviController.goBack();
        await gviController.cleanup();
        gviController = null;
      }
      mainWindow.loadFile(path.join('src', 'renderer', 'layout', 'index.html'));
    }
  },

  async startCalibration(event, config) {
    return await gviController.startCalibration(config);
  },

  async getStatus(event) {
    return gviController.getStatus();
  },

  async nextStep(event) {
    return await gviController.nextStep();
  },

  async handleFinalResult(event, passed) {
    return await gviController.handleFinalResult(passed);
  },

  async getAvailableModels(event) {
    return await gviController.getAvailableModels();
  },

  async getCalibrationSteps(event, model) {
    return await gviController.getCalibrationSteps(model);
  },

  async generatePDF(event, calibrationData) {
    return await gviController.generatePDF(calibrationData);
  },

  async openPDF(event, pdfPath) {
    return await gviController.openPDF(pdfPath);
  },

  async stopCalibration(event) {
    return await gviController.stopCalibration();
  },

  // GVI Reports handlers
  async createReport(event, gaugeModel, status, pdfLocation) {
    return gviReportsDb.createReport(gaugeModel, status, pdfLocation);
  },

  async getReportsByModel(event, model) {
    return gviReportsDb.getReportsByModel(model);
  },

  async getAllReports(event, limit = 50, offset = 0) {
    return gviReportsDb.getAllReports(limit, offset);
  },

  async getReportById(event, reportId) {
    return gviReportsDb.getReportById(reportId);
  },

  async updateReportPdfLocation(event, reportId, pdfLocation) {
    return gviReportsDb.updateReportPdfLocation(reportId, pdfLocation);
  },

  async deleteReport(event, reportId) {
    return gviReportsDb.deleteReport(reportId);
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
  ipcMain.handle('gvi-next-step', createHandler('nextStep'));
  ipcMain.handle('gvi-handle-final-result', createHandler('handleFinalResult'));

  // Data handlers
  ipcMain.handle('gvi-get-available-models', createHandler('getAvailableModels'));
  ipcMain.handle('gvi-get-calibration-steps', createHandler('getCalibrationSteps'));
  ipcMain.handle('gvi-generate-pdf', createHandler('generatePDF'));
  ipcMain.handle('gvi-open-pdf', createHandler('openPDF'));

  // GVI Reports handlers
  ipcMain.handle('gvi-create-report', createHandler('createReport', false));
  ipcMain.handle('gvi-get-reports-by-model', createHandler('getReportsByModel', false));
  ipcMain.handle('gvi-get-all-reports', createHandler('getAllReports', false));
  ipcMain.handle('gvi-get-report-by-id', createHandler('getReportById', false));
  ipcMain.handle('gvi-update-report-pdf', createHandler('updateReportPdfLocation', false));
  ipcMain.handle('gvi-delete-report', createHandler('deleteReport', false));
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
    sentryLogger.handleError(error, { module: 'GVI_IPC', method: 'cleanup' });
  }
}
