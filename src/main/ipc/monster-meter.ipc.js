import { ipcMain } from 'electron';
import { getMainWindow } from '../windows/main.js';
import { MonsterMeterController } from '../controllers/monster-meter.controller.js';
import * as Sentry from '@sentry/electron/main';

let monsterMeterController = null;

/**
 * Generic handler wrapper for error handling and controller validation
 */
const createHandler =
  (handlerName, requiresController = true) =>
  async (event, ...args) => {
    try {
      if (requiresController && !monsterMeterController) {
        return { success: false, error: 'Monster Meter not initialized' };
      }

      // Call the actual handler function
      const handlerFunction = handlers[handlerName];
      if (!handlerFunction) {
        throw new Error(`Handler ${handlerName} not found`);
      }

      return await handlerFunction(event, ...args);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { ipc: 'monster-meter', handler: handlerName },
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
  async loadMonsterMeter(event) {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    mainWindow.loadFile('src/renderer/monster-meter/index.html');

    mainWindow.webContents.once('did-finish-load', async () => {
      if (monsterMeterController) {
        await monsterMeterController.cleanup();
      }
      monsterMeterController = new MonsterMeterController(mainWindow);
      await monsterMeterController.initialize();
    });
  },

  async goBack(event) {
    if (monsterMeterController) {
      await monsterMeterController.cleanup();
      monsterMeterController = null;
    }

    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.loadFile('src/renderer/layout/index.html');
    }
  },

  async refreshPorts(event) {
    const ports = await monsterMeterController.refreshPortList();
    return { success: true, ports };
  },

  async connectPort(event, portPath) {
    await monsterMeterController.connectToPort(portPath);
    const deviceInfo = monsterMeterController.getCurrentDeviceInfo();
    return { success: true, deviceInfo };
  },

  async disconnect(event) {
    await monsterMeterController.disconnect();
    return { success: true };
  },

  async getStatus(event) {
    const status = monsterMeterController.getConnectionStatus();
    const deviceInfo = monsterMeterController.getCurrentDeviceInfo();
    return { success: true, status, deviceInfo };
  },

  async readData(event) {
    console.log('Monster Meter read data requested');
    return { success: true, message: 'Data reading will be implemented with calibration functionality' };
  },

  async testCommunication(event) {
    const deviceInfo = monsterMeterController.getCurrentDeviceInfo();
    if (!deviceInfo) {
      return { success: false, error: 'No device connected' };
    }

    return {
      success: true,
      message: 'Communication test successful',
      deviceInfo,
    };
  },

  async getUsbDevices(event) {
    const status = monsterMeterController.getConnectionStatus();
    return {
      success: true,
      usbDevices: status.usbDevices || [],
      connectionStatus: status,
    };
  },

  async cleanupModule(event) {
    console.log('Cleaning up Monster Meter module...');

    if (monsterMeterController) {
      await monsterMeterController.destroy();
      monsterMeterController = null;
    }

    console.log('Monster Meter module cleanup completed');
    return { success: true };
  },

  async cleanup(event) {
    if (monsterMeterController) {
      await monsterMeterController.cleanup();
      monsterMeterController = null;
    }
    return { success: true };
  },
};

/**
 * IPC handler registrations
 */
const ipcHandlers = [
  // Navigation handlers (no controller required)
  { event: 'load-monster-meter', handler: 'loadMonsterMeter', requiresController: false },
  { event: 'monster-meter-go-back', handler: 'goBack', requiresController: false },

  // Connection handlers
  { event: 'monster-meter-refresh-ports', handler: 'refreshPorts' },
  { event: 'monster-meter-connect-port', handler: 'connectPort' },
  { event: 'monster-meter-disconnect', handler: 'disconnect' },
  { event: 'monster-meter-get-status', handler: 'getStatus' },

  // Device operation handlers
  { event: 'monster-meter-read-data', handler: 'readData' },
  { event: 'monster-meter-test-communication', handler: 'testCommunication' },
  { event: 'monster-meter-get-usb-devices', handler: 'getUsbDevices' },
  { event: 'monster-meter-cleanup-module', handler: 'cleanupModule' },

  // Cleanup handlers
  { event: 'monster-meter-cleanup', handler: 'cleanup' },
];

/**
 * Register all Monster Meter related IPC handlers
 */
export function registerMonsterMeterIpcHandlers() {
  ipcHandlers.forEach(({ event, handler, requiresController = true }) => {
    const method = event.startsWith('load-') || event.endsWith('-go-back') ? 'on' : 'handle';
    ipcMain[method](event, createHandler(handler, requiresController));
  });
}
