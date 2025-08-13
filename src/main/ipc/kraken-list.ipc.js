import { ipcMain } from "electron";
import path from "path";
import { getMainWindow } from "../windows/main.js";
import { KrakenListController } from "../controllers/kraken-list.controller.js";

let krakenListController = null;

/**
 * Register all kraken-related IPC handlers
 */
export function registerKrakenListIpcHandlers() {
  // Navigation handler
  ipcMain.on("load-kraken-list", async () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Load kraken list page
      mainWindow.loadFile(path.join("src", "renderer", "kraken-list", "index.html"));
      
      // Initialize controller when page loads
      mainWindow.webContents.once("did-finish-load", async () => {
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
  ipcMain.handle("kraken-start-scan", async () => {
    if (!krakenListController) {
      return { success: false, error: "Kraken list not initialized" };
    }
    return await krakenListController.startScanning();
  });

  ipcMain.handle("kraken-stop-scan", async () => {
    if (!krakenListController) {
      return { success: false, error: "Kraken list not initialized" };
    }
    return await krakenListController.stopScanning();
  });

  ipcMain.handle("kraken-refresh-scan", async () => {
    if (!krakenListController) {
      return { success: false, error: "Kraken list not initialized" };
    }
    return await krakenListController.refreshScan();
  });

  // Connection operations
  ipcMain.handle("kraken-connect-devices", async (event, deviceIds) => {
    if (!krakenListController) {
      return { success: false, error: "Kraken list not initialized" };
    }
    return await krakenListController.connectToSelectedDevices(deviceIds);
  });

  ipcMain.on("kraken-set-selected-devices", (event, deviceIds) => {
    if (krakenListController) {
      krakenListController.setSelectedDevices(deviceIds);
    }
  });

  // Data retrieval operations
  ipcMain.handle("kraken-get-discovered-devices", () => {
    if (!krakenListController) {
      return [];
    }
    return krakenListController.getDiscoveredDevices();
  });

  ipcMain.handle("kraken-get-connected-devices", () => {
    if (!krakenListController) {
      return [];
    }
    return krakenListController.getConnectedDevices();
  });

  ipcMain.handle("kraken-get-scan-status", () => {
    if (!krakenListController) {
      return { isScanning: false, bluetoothState: 'unknown', deviceCount: 0 };
    }
    return krakenListController.getScanStatus();
  });

  ipcMain.handle("kraken-get-connection-status", () => {
    if (!krakenListController) {
      return { connectedCount: 0, connectingCount: 0, connectedDeviceIds: [] };
    }
    return krakenListController.getConnectionStatus();
  });

  // Cleanup operations
  ipcMain.on("cleanup-kraken-list", async () => {
    if (krakenListController) {
      await krakenListController.cleanup();
      krakenListController = null;
    }
  });
}

/**
 * Get the current kraken list controller instance
 * @returns {KrakenListController|null}
 */
export function getKrakenListController() {
  return krakenListController;
}

/**
 * Cleanup kraken list resources
 */
export async function cleanupKrakenListIpc() {
  if (krakenListController) {
    await krakenListController.cleanup();
    krakenListController = null;
  }
} 