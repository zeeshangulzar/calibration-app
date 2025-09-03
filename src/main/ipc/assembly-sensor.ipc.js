import { ipcMain } from 'electron';
import { getMainWindow } from '../windows/main.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAGINATION } from '../../config/constants/app.constants.js';
import {
  getAssembledSensors,
  saveAssembledSensorData,
  deleteAssembledSensorData,
  updateAssembledSensorData,
  checkDuplicateQR,
} from '../services/assembly-sensor.service.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Register Assembly Sensor IPC handlers
 */
export function registerAssemblySensorIpcHandlers() {
  // Load assembly sensor screen
  ipcMain.handle('assembly-sensors', async () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      try {
        const htmlPath = path.join(__dirname, '../../renderer/assembly-sensor', 'index.html');
        await mainWindow.loadFile(htmlPath);
        mainWindow.webContents.once('did-finish-load', async () => {
          console.log('Assembly sensor page loaded successfully');
        });
      } catch (error) {
        console.error('Error loading assembly sensor page:', error);
        // Try alternative path
        const altPath = path.join(__dirname, '../../../renderer/assembly-sensor', 'index.html');
        try {
          await mainWindow.loadFile(altPath);
          console.log('Assembly sensor page loaded from alternative path');
        } catch (altError) {
          console.error('Failed to load assembly sensor page from both paths');
        }
      }
    }
  });

  // Get assembled sensors with pagination
  ipcMain.handle('get-assembled-sensors', async (event, { page = PAGINATION.DEFAULT_PAGE, size = PAGINATION.DEFAULT_SIZE }) => {
    try {
      return await getAssembledSensors(page, size);
    } catch (error) {
      console.error('Failed to get assembled sensors:', error);
      return { rows: [], totalCount: 0 };
    }
  });

  // Save assembled sensor
  ipcMain.on('save-assembled-sensor', async (event, data) => {
    try {
      const result = await saveAssembledSensorData(data);
      if (result.success) {
        event.sender.send('assembled-saved', 'saved');
      } else {
        event.sender.send('assembled-saved', 'error');
      }
    } catch (error) {
      console.error('Failed to save assembled sensor:', error);
      event.sender.send('assembled-saved', 'error');
    }
  });

  // Delete assembled sensor
  ipcMain.on('delete-assembled-sensor', async (event, id) => {
    try {
      const result = await deleteAssembledSensorData(id);
      if (result.success) {
        event.sender.send('assembled-saved', 'deleted');
      } else {
        event.sender.send('assembled-saved', 'error');
      }
    } catch (error) {
      console.error('Failed to delete assembled sensor:', error);
      event.sender.send('assembled-saved', 'error');
    }
  });

  // Update assembled sensor
  ipcMain.on('update-assembled-sensor', async (event, updatedData) => {
    try {
      const result = await updateAssembledSensorData(updatedData);
      if (result.success) {
        event.sender.send('assembled-saved', 'updated');
      } else {
        event.sender.send('assembled-saved', 'error');
      }
    } catch (error) {
      console.error('Failed to update assembled sensor:', error);
      event.sender.send('assembled-saved', 'error');
    }
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
