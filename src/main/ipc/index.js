import { ipcMain } from "electron";
import path from "path";
import { getMainWindow } from "../windows/main.js";
import { registerKrakenListIpcHandlers } from "./kraken-list.ipc.js";
import { registerKrakenCalibrationIpcHandlers, cleanupKrakenCalibration } from "./kraken-calibration.ipc.js";
import { registerSettingsIpcHandlers } from "./settings.ipc.js";
import { registerAssemblySensorIpcHandlers } from "./assembly-sensor.ipc.js";

/**
 * Register all IPC handlers for the application
 */
export function registerIpcHandlers() {
  // Register core application handlers
  registerCoreIpcHandlers();
  
  // Register feature-specific handlers
  registerKrakenListIpcHandlers();
  registerKrakenCalibrationIpcHandlers();
  registerSettingsIpcHandlers();
  registerAssemblySensorIpcHandlers();
}

function registerCoreIpcHandlers() {
  // Home screen navigation
  ipcMain.on("load-home-screen", () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.loadFile(path.join("src", "renderer", "layout", "index.html"));
    }
  });

  // Migration status handler
  ipcMain.handle("get-migration-status", async () => {
    try {
      const { getDatabase } = await import('../db/index.js');
      const db = getDatabase();
      const { MigrationManager } = await import('../db/migration-manager.js');
      
      const migrationManager = new MigrationManager(db);
      const status = migrationManager.getMigrationStatus();
      
      return { success: true, status,
        isDevelopment: process.env.NODE_ENV === 'development'
      };
    } catch (error) {
      console.error("Failed to get migration status:", error);
      return { success: false, error: error.message };
    }
  });
}

/**
 * Cleanup all IPC resources (called on app quit)
 */
export async function cleanupIpcResources() {
  try {
    console.log('Cleaning up IPC resources...');
    
    // Cleanup kraken calibration (includes Fluke disconnection)
    await cleanupKrakenCalibration();
    
    console.log('IPC resources cleanup completed');
  } catch (error) {
    console.error('Error during IPC resources cleanup:', error);
  }
}
