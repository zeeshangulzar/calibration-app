import { ipcMain } from 'electron';
import path from 'path';
import { getMainWindow } from '../windows/main.js';
import { registerKrakenListIpcHandlers } from './kraken-list.ipc.js';
import { registerKrakenCalibrationIpcHandlers, cleanupKrakenCalibration } from './kraken-calibration.ipc.js';
import { registerSettingsIpcHandlers, cleanupSettings } from './settings.ipc.js';
import { registerDeveloperSettingsIpcHandlers } from './developer-settings.ipc.js';
import { registerMonsterMeterIpcHandlers, cleanupMonsterMeter } from './monster-meter.ipc.js';
import { registerGVIIpcHandlers, cleanupGVI } from './gvi.ipc.js';
import { registerAssemblySensorIpcHandlers } from './assembly-sensor.ipc.js';
import { registerMigrationIpcHandlers } from './migration.ipc.js';

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
  registerMigrationIpcHandlers();
  registerDeveloperSettingsIpcHandlers();
  registerMonsterMeterIpcHandlers();
  registerGVIIpcHandlers();
}

function registerCoreIpcHandlers() {
  // Home screen navigation
  ipcMain.on('load-home-screen', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.loadFile(path.join('src', 'renderer', 'layout', 'index.html'));
    }
  });
}

/**
 * Cleanup all IPC resources (called on app quit)
 */
export async function cleanupIpcResources() {
  try {
    console.log('Cleaning up IPC resources...');

    // Cleanup settings (includes Fluke disconnection for test connections)
    await cleanupSettings();

    // Cleanup Monster Meter (includes any Fluke connections)
    await cleanupMonsterMeter();

    // Cleanup kraken calibration (includes Fluke disconnection)
    await cleanupKrakenCalibration();

    // Cleanup GVI flow meter
    await cleanupGVI();

    console.log('IPC resources cleanup completed');
  } catch (error) {
    console.error('Error during IPC resources cleanup:', error);
  }
}
