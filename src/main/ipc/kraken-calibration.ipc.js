import { ipcMain } from 'electron';
import path from 'path';
import { getMainWindow } from '../windows/main.js';
import { KrakenCalibrationController } from '../controllers/kraken-calibration.controller.js';
import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';
import { addDelay } from '../../shared/helpers/calibration-helper.js';

let krakenCalibrationController = null;

function checkControllerInitialized() {
  if (!krakenCalibrationController) {
    return { success: false, error: 'Kraken calibration not initialized' };
  }
  return null;
}

/**
 * Register all kraken calibration related IPC handlers
 */
export function registerKrakenCalibrationIpcHandlers() {
  registerNavigationHandlers();
  registerDeviceOperationHandlers();
  registerCalibrationHandlers();
  registerStatusHandlers();
  registerCleanupHandlers();
}

function registerNavigationHandlers() {
  // Navigation handler - load calibration page with connected devices
  ipcMain.on('load-kraken-calibration', async (event, connectedDeviceIds) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Load kraken calibration page
      mainWindow.loadFile(path.join('src', 'renderer', 'kraken-calibration', 'index.html'));

      // Initialize controller when page loads
      mainWindow.webContents.once('did-finish-load', async () => {
        // Clean up existing controller if any
        if (krakenCalibrationController) {
          await krakenCalibrationController.cleanup();
        }

        krakenCalibrationController = new KrakenCalibrationController(mainWindow);
        await krakenCalibrationController.initialize(connectedDeviceIds);
      });
    }
  });
}

function registerDeviceOperationHandlers() {
  // Device setup operations
  ipcMain.handle('kraken-calibration-retry-device', async (event, deviceId) => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await krakenCalibrationController.retryDeviceSetup(deviceId);
  });

  // Device connectivity operations
  ipcMain.handle('kraken-calibration-reconnect-device', async (event, deviceId) => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await krakenCalibrationController.reconnectDisconnectedDevice(deviceId);
  });

  ipcMain.handle('kraken-calibration-disconnect-device', async (event, deviceId) => {
    const error = checkControllerInitialized();
    if (error) return error;
    return await krakenCalibrationController.manuallyDisconnectDevice(deviceId);
  });
}

function registerCalibrationHandlers() {
  // Calibration operations
  ipcMain.handle('kraken-calibration-start', async (event, testerName) => {
    const error = checkControllerInitialized();

    if (error) return error;
    return await krakenCalibrationController.startCalibration(testerName);
  });

  ipcMain.handle('kraken-calibration-stop', async () => {
    const error = checkControllerInitialized();

    if (error) return error;
    return await krakenCalibrationController.stopCalibration('Calibration stopped', '', true);
  });

  ipcMain.handle('kraken-calibration-start-verification', async () => {
    const error = checkControllerInitialized();

    if (error) return error;
    return await krakenCalibrationController.startVerification();
  });

  // Real-time verification updates
  ipcMain.on('kraken-verification-realtime-update', (event, data) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('kraken-verification-realtime-update', data);
    }
  });

  ipcMain.on('update-kraken-calibration-reference-pressure', (event, pressure) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('update-kraken-calibration-reference-pressure', pressure);
    }
  });

  ipcMain.on('update-kraken-pressure', (event, data) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('update-kraken-pressure', data);
    }
  });

  ipcMain.handle('kraken-verification-start', async (event, testerName) => {
    const error = checkControllerInitialized();

    if (error) return error;

    try {
      await krakenCalibrationController.startVerification();
      return { success: true };
    } catch (error) {
      console.error('Error starting verification:', error);
      return {
        success: false,
        error: error.message || 'Failed to start verification process',
      };
    }
  });
}

function registerStatusHandlers() {
  // Status and data retrieval
  ipcMain.handle('kraken-calibration-get-status', () => {
    if (!krakenCalibrationController) {
      return {
        connectedDeviceCount: 0,
        setupProgress: 0,
        isSetupInProgress: false,
        devices: [],
      };
    }
    return krakenCalibrationController.getStatus();
  });
}

function registerCleanupHandlers() {
  // Navigation back to sensor list (with background cleanup like old app)
  ipcMain.handle('kraken-calibration-go-back', async () => {
    console.log('Back button clicked - starting background cleanup...');

    const mainWindow = getMainWindow();

    // Immediately navigate to kraken list (like old app)
    if (mainWindow) {
      mainWindow.loadFile(path.join('src', 'renderer', 'kraken-list', 'index.html'));
      // Ensure the event is sent after the new page is ready
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('enable-connect-cooldown', {
          cooldownMs: KRAKEN_CONSTANTS.CONNECT_BUTTON_COOLDOWN_MS,
          label: 'Cooling down...',
        });
      });
    }

    // Start cleanup in background and notify when complete (like old app)
    if (krakenCalibrationController) {
      // Send kraken cleanup started event to disable connect button
      if (mainWindow) {
        mainWindow.webContents.send('kraken-cleanup-started');
      }

      try {
        // Background cleanup with proper sequencing
        await krakenCalibrationController.cleanup();
        krakenCalibrationController = null;

        console.log('Background cleanup completed successfully');

        // Add small delay to ensure everything has settled
        await addDelay(KRAKEN_CONSTANTS.DELAY_BETWEEN_SETUP);

        // Send kraken cleanup completed event to re-enable connect button
        if (mainWindow) {
          mainWindow.webContents.send('kraken-cleanup-completed');
        }
      } catch (error) {
        console.error('Error during background cleanup:', error);

        // Even if kraken cleanup fails, re-enable the button after a delay
        if (mainWindow) {
          setTimeout(() => {
            mainWindow.webContents.send('kraken-cleanup-completed');
          }, KRAKEN_CONSTANTS.CLEANUP_TIMEOUT);
        }
      }
    } else {
      // No controller to cleanup, immediately enable connect button
      if (mainWindow) {
        mainWindow.webContents.send('kraken-cleanup-completed');
      }
    }

    return { success: true };
  });

  // Cleanup handler
  ipcMain.on('kraken-calibration-cleanup', async () => {
    if (krakenCalibrationController) {
      await krakenCalibrationController.cleanup();
      krakenCalibrationController = null;
    }
  });
}

/**
 * Cleanup kraken calibration resources (called on app quit)
 */
export async function cleanupKrakenCalibration() {
  if (krakenCalibrationController) {
    try {
      console.log('Cleaning up Kraken calibration on app quit...');
      await krakenCalibrationController.cleanup();
      krakenCalibrationController = null;
      console.log('Kraken calibration cleanup completed');
    } catch (error) {
      console.error('Error during Kraken calibration cleanup on app quit:', error);
    }
  }
}
