import { ipcMain } from 'electron';
import { getMainWindow } from '../windows/main.js';
import {
  setAssemblyMainWindow,
  getAssembledSensors,
  saveAssembledSensorData,
  deleteAssembledSensorData,
  updateAssembledSensorData,
  checkDuplicateQR,
} from '../services/assembly-sensor.service.js';

/**
 * Register Assembly Sensor IPC handlers
 */
export function registerAssemblySensorIpcHandlers() {
  // Load assembly sensor screen
  ipcMain.handle('assembly-sensors', async () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      await setAssemblyMainWindow(mainWindow);
    }
  });

  // Get assembled sensors with pagination
  ipcMain.handle('get-assembled-sensors', async (event, { page = 1, size = 20 }) => {
    try {
      return await getAssembledSensors(page, size);
    } catch (error) {
      console.error('Failed to get assembled sensors:', error);
      return { rows: [], totalCount: 0 };
    }
  });

  // Save assembled sensor
  ipcMain.on('save-assembled-sensor', (event, data) => {
    saveAssembledSensorData(data);
  });

  // Delete assembled sensor
  ipcMain.on('delete-assembled-sensor', (event, id) => {
    deleteAssembledSensorData(id);
  });

  // Update assembled sensor
  ipcMain.on('update-assembled-sensor', (event, updatedData) => {
    updateAssembledSensorData(updatedData);
  });

  // Check for duplicate QR codes
  ipcMain.handle('check-duplicate-qr', async (event, data) => {
    try {
      return await checkDuplicateQR(data);
    } catch (error) {
      console.error('Failed to check duplicate QR:', error);
      return 'none';
    }
  });
}
