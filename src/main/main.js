import EventEmitter from 'events';
EventEmitter.defaultMaxListeners = 500;
import { app } from 'electron';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMainWindow } from './windows/main.js';
import { registerIpcHandlers, cleanupIpcResources } from './ipc/index.js';
import { initializeDatabase, closeDatabase } from './db/index.js';
import { runAllSeeds } from './db/seeds/index.js';
import { getLocationService } from '../shared/helpers/location-helper.js';
import * as Sentry from '@sentry/electron/main';

// Initialize Sentry for crash tracking (must be done early)
import { getMainProcessConfig, isSentryConfigured } from '../config/sentry.config.js';
import { sentryLogger } from './loggers/sentry.logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables first
// Try multiple possible locations for .env file
const possibleEnvPaths = app.isPackaged
  ? [path.join(process.resourcesPath, 'app', '.env'), path.join(process.resourcesPath, '.env'), path.join(__dirname, '.env'), path.join(process.cwd(), '.env')]
  : [path.resolve(__dirname, '../../.env')];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  // console.log('Trying to load environment from:', envPath);
  const envResult = dotenv.config({ path: envPath });
  if (!envResult.error) {
    // console.log('Environment file loaded successfully from:', envPath);
    envLoaded = true;
    break;
  }
}
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
      sentryLogger.handleError(error, { module: 'MAIN', method: 'uncaughtException', tags: { errorType: 'ERR_UNHANDLED_ERROR' } });
    }
    console.error('App continuing despite unhandled EventEmitter error');
    return; // Don't process this error further
  }

  // Handle other uncaught exceptions
  console.error('Uncaught exception:', error);
  if (isSentryConfigured()) {
    sentryLogger.handleError(error, { module: 'MAIN', method: 'uncaughtException' });
  }

  // Log the error but don't crash the app
  // In development, we might want to see the error more prominently
  if (process.env.NODE_ENV === 'development') {
    console.error('Development mode: Consider fixing this uncaught exception');
  } else {
    sentryLogger.handleError(error, { module: 'MAIN', method: 'uncaughtException', level: 'error' });
  }
});

// Handle EventEmitter errors specifically
process.on('error', error => {
  console.error('Process error:', error);
  if (isSentryConfigured()) {
    sentryLogger.handleError(error, { module: 'MAIN', method: 'processError' });
  }
  console.error('App continuing despite process error');
});

process.on('unhandledRejection', reason => {
  console.error('Unhandled rejection:', reason);
  if (isSentryConfigured()) {
    sentryLogger.handleError(new Error(`Unhandled Rejection: ${reason}`), { module: 'MAIN', method: 'unhandledRejection' });
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
    const db = await initializeDatabase();
    console.log('Database initialized successfully');

    // Run database seeds
    try {
      const seedResult = await runAllSeeds(db);
      if (!seedResult.success) {
        console.warn('Database seeding failed:', seedResult.error);
        throw seedResult.error;
      }
    } catch (seedError) {
      console.warn('Failed to run database seeds:', seedError.message);
      throw seedError;
    }

    // Initialize location service
    try {
      console.log('Initializing location service...');
      const locationService = getLocationService();
      await locationService.initialize();
      console.log('Location service initialized successfully');
    } catch (locationError) {
      console.warn('Failed to initialize location service:', locationError.message);
      // Continue with app startup even if location service fails
    }
  } catch (error) {
    sentryLogger.handleError(error, { module: 'MAIN', method: 'initializeDatabase' });
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

  // Set a timeout to force quit if cleanup takes too long
  const cleanupTimeout = setTimeout(() => {
    console.log('Cleanup timeout reached, forcing quit...');
    app.exit(0);
  }, 5000); // 5 second timeout

  try {
    // Cleanup IPC resources (includes Fluke disconnection)
    await cleanupIpcResources();

    // Close database
    closeDatabase();

    console.log('App cleanup completed, quitting...');
  } catch (error) {
    sentryLogger.handleError(error, { module: 'MAIN', method: 'appCleanup' });
    console.error('Error during app cleanup:', error);
  } finally {
    clearTimeout(cleanupTimeout);
    // Force quit after cleanup (or timeout)
    app.exit(0);
  }
});

// Handle process termination signals for immediate cleanup
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, performing immediate cleanup...');
  try {
    await cleanupIpcResources();
  } catch (error) {
    console.error('Error during SIGTERM cleanup:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, performing immediate cleanup...');
  try {
    await cleanupIpcResources();
  } catch (error) {
    console.error('Error during SIGINT cleanup:', error);
  }
  process.exit(0);
});
