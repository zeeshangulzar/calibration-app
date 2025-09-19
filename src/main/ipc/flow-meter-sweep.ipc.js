import { ipcMain } from 'electron';
import path from 'path';
import { FlowMeterSweepController } from '../controllers/flow-meter-sweep.controller.js';
import { getMainWindow } from '../windows/main.js';

let flowMeterSweepController = null;

const createHandler =
  (handlerName, shouldReturn = true) =>
  async (event, ...args) => {
    try {
      if (!flowMeterSweepController) {
        return { success: false, error: 'Flow meter sweep controller not initialized' };
      }

      const result = await flowMeterSweepController[handlerName](...args);
      return shouldReturn ? result : { success: true };
    } catch (error) {
      console.error(`Error in ${handlerName}:`, error);
      return { success: false, error: error.message };
    }
  };

/**
 * Handler functions
 */
const handlers = {
  async loadFlowMeterSweep(event) {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    // Clean up existing controller if any
    if (flowMeterSweepController) {
      await flowMeterSweepController.cleanup();
    }

    // Initialize controller before loading the page
    flowMeterSweepController = new FlowMeterSweepController(mainWindow);
    await flowMeterSweepController.initialize();

    mainWindow.loadFile(path.join('src', 'renderer', 'flow-meter-sweep', 'index.html'));
  },

  async flowMeterSweepGoBack(event) {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (flowMeterSweepController) {
        await flowMeterSweepController.goBack();
        await flowMeterSweepController.cleanup();
        flowMeterSweepController = null;
      }
      mainWindow.loadFile(path.join('src', 'renderer', 'layout', 'index.html'));
    }
  },

  async getAvailableFlowMeters(event) {
    return await flowMeterSweepController.getAvailableFlowMeters();
  },

  async getPressureRanges(event, flowMeterId) {
    return await flowMeterSweepController.getPressureRanges(flowMeterId);
  },

  async startSweep(event, config) {
    return await flowMeterSweepController.startSweep(config);
  },

  async getStatus(event) {
    return flowMeterSweepController.getStatus();
  },

  async nextStep(event) {
    return await flowMeterSweepController.nextStep();
  },

  async completeSweep(event) {
    return await flowMeterSweepController.completeSweep();
  },
};

/**
 * Register all Flow Meter Sweep related IPC handlers
 */
export function registerFlowMeterSweepIpcHandlers() {
  // Navigation handlers
  ipcMain.on('load-flow-meter-sweep', handlers.loadFlowMeterSweep);
  ipcMain.on('flow-meter-sweep-go-back', handlers.flowMeterSweepGoBack);

  // Data handlers
  ipcMain.handle('flow-meter-sweep-get-available-flow-meters', createHandler('getAvailableFlowMeters'));
  ipcMain.handle('flow-meter-sweep-get-pressure-ranges', createHandler('getPressureRanges'));

  // Sweep handlers
  ipcMain.handle('flow-meter-sweep-start-sweep', createHandler('startSweep'));
  ipcMain.handle('flow-meter-sweep-get-status', createHandler('getStatus'));
  ipcMain.handle('flow-meter-sweep-next-step', createHandler('nextStep'));
  ipcMain.handle('flow-meter-sweep-complete-sweep', createHandler('completeSweep'));
}

/**
 * Cleanup function for Flow Meter Sweep module
 */
export async function cleanupFlowMeterSweep() {
  try {
    if (flowMeterSweepController) {
      await flowMeterSweepController.cleanup();
      flowMeterSweepController = null;
    }
  } catch (error) {
    console.error('Error cleaning up flow meter sweep:', error);
  }
}
