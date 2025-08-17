import { ipcMain } from 'electron';
import path from 'path';
import { getMainWindow } from '../windows/main.js';
import { KrakenListController } from '../controllers/kraken-list.controller.js';

let krakenListController = null;

/**
 * Helper function to check if controller is initialized and return appropriate error
 * @param {string} operation - Name of the operation being performed
 * @returns {object|null} Error object if not initialized, null if initialized
 */
function checkControllerInitialized(operation = 'operation') {
  if (!krakenListController) {
    return { success: false, error: 'Kraken list not initialized' };
  }
  return null;
}

/**
 * Helper function to get controller or return default value for data retrieval operations
 * @param {any} defaultValue - Default value to return if controller not initialized
 * @returns {any} Controller result or default value
 */
function getControllerDataOrDefault(defaultValue, getter) {
  if (!krakenListController) {
    return defaultValue;
  }
  return getter(krakenListController);
}

/**
 * Register all kraken-related IPC handlers
 */
export function registerKrakenListIpcHandlers() {
  // Navigation handler
  ipcMain.on('load-kraken-list', async () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Load kraken list page
      mainWindow.loadFile(path.join('src', 'renderer', 'kraken-list', 'index.html'));

      // Initialize controller when page loads
      mainWindow.webContents.once('did-finish-load', async () => {
        // Don't cleanup existing controller to maintain continuous scanning
        if (!krakenListController) {
          krakenListController = new KrakenListController(mainWindow);
          await krakenListController.initialize();
        } else {
          // Just update the window reference for existing controller
          krakenListController.mainWindow = mainWindow;
        }
      });
    }
  });

  // Scanning operations
  ipcMain.handle('kraken-start-scan', async () => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await krakenListController.startScanning();
  });

  ipcMain.handle('kraken-stop-scan', async () => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await krakenListController.stopScanning();
  });

  ipcMain.handle('kraken-refresh-scan', async () => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await krakenListController.refreshScan();
  });

  // Connection operations
  ipcMain.handle('kraken-connect-devices', async (event, deviceIds) => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await krakenListController.connectToSelectedDevices(deviceIds);
  });

  ipcMain.on('kraken-set-selected-devices', (event, deviceIds) => {
    if (krakenListController) {
      krakenListController.setSelectedDevices(deviceIds);
    }
  });

  // Handle user choosing to proceed to calibration after seeing connection results
  ipcMain.handle('kraken-proceed-to-calibration', async () => {
    if (!krakenListController) {
      return { success: false, error: 'Kraken list not initialized' };
    }

    try {
      // Get the connected devices from global state
      const connectedDevices = krakenListController.globalState.getConnectedDevices();
      if (connectedDevices.length === 0) {
        return { success: false, error: 'No connected devices available' };
      }

      // Proceed to calibration with the devices
      krakenListController.proceedToCalibration(
        connectedDevices,
        krakenListController.selectedDeviceIds.size
      );
      return { success: true };
    } catch (error) {
      console.error('Error proceeding to calibration:', error);
      return { success: false, error: error.message };
    }
  });

  // Data retrieval operations
  ipcMain.handle('kraken-get-discovered-devices', () => {
    return getControllerDataOrDefault([], controller => controller.getDiscoveredDevices());
  });

  ipcMain.handle('kraken-get-connected-devices', () => {
    return getControllerDataOrDefault([], controller => controller.getConnectedDevices());
  });

  ipcMain.handle('kraken-get-scan-status', () => {
    return getControllerDataOrDefault(
      { isScanning: false, bluetoothState: 'unknown', deviceCount: 0 },
      controller => controller.getScanStatus()
    );
  });

  ipcMain.handle('kraken-get-connection-status', () => {
    return getControllerDataOrDefault(
      { connectedCount: 0, connectingCount: 0, connectedDeviceIds: [] },
      controller => controller.getConnectionStatus()
    );
  });

  // Cleanup operations
  ipcMain.on('cleanup-kraken-list', async () => {
    if (krakenListController) {
      await krakenListController.cleanup();
      krakenListController = null;
    }
  });
}
