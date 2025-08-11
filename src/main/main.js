import EventEmitter from "events";
EventEmitter.defaultMaxListeners = 500;
import { app } from "electron";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createMainWindow } from "./windows/main.js";
import { registerIpcHandlers } from "./ipc/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const currentAppVersion = app.getVersion();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.whenReady().then(() => {
  createMainWindow(currentAppVersion, __dirname);
  registerIpcHandlers();
});
