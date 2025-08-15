import EventEmitter from 'events';
EventEmitter.defaultMaxListeners = 500;
import { app } from 'electron';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMainWindow } from './windows/main.js';
import { registerIpcHandlers } from './ipc/index.js';
import { initializeDatabase, closeDatabase } from './db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const currentAppVersion = app.getVersion();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.whenReady().then(async () => {
  try {
    // Initialize database
    console.log('App ready, initializing database...');
    initializeDatabase();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // Continue with app startup even if database fails
  }

  createMainWindow(currentAppVersion, __dirname);
  registerIpcHandlers();
});

// Cleanup on app exit
app.on('before-quit', () => {
  closeDatabase();
});
