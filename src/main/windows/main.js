import { BrowserWindow, Menu, screen, app } from "electron";
import path from "path";

let mainWindow;

export function createMainWindow(currentAppVersion, __dirname) {
  if (["production", "staging"].includes(process.env.NODE_ENV)) {
    Menu.setApplicationMenu(null);
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../", "preload", "main.js"),
    },
    icon: path.join(__dirname, "assets", "icons", "logo.png"),
  });
  mainWindow.loadFile(path.join("src", "renderer", "layout", "index.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("show-app-version", currentAppVersion);
  });

  mainWindow.on("close", () => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.executeJavaScript("localStorage.clear()");
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(currentAppVersion, __dirname);
    }
  });

  return mainWindow;
}

export function getMainWindow() {
  return mainWindow;
}
