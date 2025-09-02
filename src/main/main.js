import EventEmitter from 'events';
EventEmitter.defaultMaxListeners = 500;
import { app } from 'electron';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMainWindow } from './windows/main.js';
import { registerIpcHandlers, cleanupIpcResources } from './ipc/index.js';
import { initializeDatabase, closeDatabase } from './db/index.js';

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

// Enhanced error handlers to prevent app crashes
process.on('uncaughtException', error => {
  // Handle specific unhandled errors from EventEmitter
  if (error.code === 'ERR_UNHANDLED_ERROR') {
    console.error('Unhandled EventEmitter error:', error);
    if (isSentryConfigured()) {
      Sentry.captureException(error);
    }
    console.error('App continuing despite unhandled EventEmitter error');
    return; // Don't process this error further
  }

  // Handle other uncaught exceptions
  console.error('Uncaught exception:', error);
  if (isSentryConfigured()) {
    Sentry.captureException(error);
  }

  // Log the error but don't crash the app
  // In development, we might want to see the error more prominently
  if (process.env.NODE_ENV === 'development') {
    console.error('Development mode: Consider fixing this uncaught exception');
  } else {
    Sentry.captureException(error);
  }
});

// Handle EventEmitter errors specifically
process.on('error', error => {
  console.error('Process error:', error);
  if (isSentryConfigured()) {
    Sentry.captureException(error);
  }
  console.error('App continuing despite process error');
});

process.on('unhandledRejection', reason => {
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

app.whenReady().then(async () => {
  try {
    // Initialize database
    console.log('App ready, initializing database...');
    initializeDatabase();
    console.log('Database initialized successfully');
  } catch (error) {
    Sentry.captureException(error);
    console.error('Failed to initialize database:', error);
    // Continue with app startup even if database fails
  }

  createMainWindow(currentAppVersion, __dirname);
  registerIpcHandlers();
});

// Cleanup on app exit
app.on('before-quit', async event => {
  console.log('App is quitting, performing cleanup...');

  // Prevent immediate quit to allow async cleanup
  event.preventDefault();

  try {
    // Cleanup IPC resources (includes Fluke disconnection)
    await cleanupIpcResources();

    // Close database
    closeDatabase();

    console.log('App cleanup completed, quitting...');
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error during app cleanup:', error);
  } finally {
    // Force quit after cleanup (or timeout)
    app.exit(0);
  }
});
