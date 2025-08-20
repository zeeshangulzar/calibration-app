import EventEmitter from 'events';
EventEmitter.defaultMaxListeners = 500;
import { app } from 'electron';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMainWindow } from './windows/main.js';
import { registerIpcHandlers } from './ipc/index.js';

// Initialize Sentry for crash tracking (must be done early)
import * as Sentry from '@sentry/electron/main';
import { getMainProcessConfig, isSentryConfigured } from '../config/sentry.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables first
dotenv.config();

// Initialize Sentry for crash tracking only
if (isSentryConfigured()) {
  Sentry.init(getMainProcessConfig());
  console.log('Sentry crash tracking enabled');
} else {
  console.warn('Sentry not configured - crash tracking disabled');
}

const currentAppVersion = app.getVersion();

// Simple crash handlers
process.on('uncaughtException', error => {
  console.error('App crashed:', error);
  if (isSentryConfigured()) {
    Sentry.captureException(error);
  }
  if (process.env.NODE_ENV !== 'development') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
  if (isSentryConfigured()) {
    Sentry.captureException(new Error(`Unhandled Rejection: ${reason}`));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.whenReady().then(() => {
  createMainWindow(currentAppVersion, __dirname);
  registerIpcHandlers();
});
