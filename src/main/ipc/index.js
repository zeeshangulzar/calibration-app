import { ipcMain } from "electron";
import path from "path";
import { getMainWindow } from "../windows/main.js";
import { registerKrakenListIpcHandlers } from "./kraken-list.ipc.js";
import { registerKrakenCalibrationIpcHandlers } from "./kraken-calibration.ipc.js";
import { registerSettingsIpcHandlers } from "./settings.ipc.js";

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
}

function registerCoreIpcHandlers() {
  // Home screen navigation
  ipcMain.on("load-home-screen", () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.loadFile(path.join("src", "renderer", "layout", "index.html"));
    }
  });
}
