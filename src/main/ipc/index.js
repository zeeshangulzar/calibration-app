import { ipcMain } from "electron";
import path from "path";
import { getMainWindow } from "../windows/main.js";

export function registerIpcHandlers() {
  ipcMain.on("load-home-screen", () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.loadFile(path.join("src", "renderer", "layout", "index.html"));
    }
  });
}
