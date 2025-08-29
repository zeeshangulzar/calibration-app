import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { getMainWindow } from '../windows/main.js';
import {
  deleteAssembledSensor,
  getAllAssembledSensors,
  getDuplicateAssembly,
  saveAssembledSensor,
  updateAssembledSensor,
} from '../db/assembly-sensor.db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

/**
 * Set the main window reference for assembly sensor operations
 */
async function setAssemblyMainWindow(window) {
  mainWindow = window;
  if (mainWindow) {
    try {
      const htmlPath = path.join(__dirname, '../../renderer/assembly-sensor', 'index.html');
      console.log('Loading assembly sensor HTML from:', htmlPath);
      console.log('Current directory:', __dirname);
      console.log('Resolved path:', htmlPath);
      
      // Check if file exists
      try {
        await fs.access(htmlPath);
        console.log('HTML file exists at path');
      } catch (error) {
        console.error('HTML file does not exist at path');
        // Try alternative path
        const altPath = path.join(__dirname, '../../../renderer/assembly-sensor', 'index.html');
        console.log('Trying alternative path:', altPath);
        try {
          await fs.access(altPath);
          console.log('HTML file exists at alternative path');
          mainWindow.loadFile(altPath);
        } catch (altError) {
          console.error('HTML file not found at alternative path either');
        }
        return;
      }
      
      mainWindow.loadFile(htmlPath);
      mainWindow.webContents.once('did-finish-load', async () => {
        console.log('Assembly sensor page loaded successfully');
      });
    } catch (error) {
      console.error('Error loading assembly sensor page:', error);
    }
  }
}

/**
 * Get assembled sensors with pagination
 */
async function getAssembledSensors(page = 1, size = 20) {
  try {
    return getAllAssembledSensors(page, size);
  } catch (error) {
    console.error('Failed to get assembled sensors:', error);
    return { rows: [], totalCount: 0 };
  }
}

/**
 * Save assembled sensor
 */
function saveAssembledSensorData(data) {
  try {
    const result = saveAssembledSensor(data);
    if (result.success) {
      mainWindow.webContents.send('assembled-saved', 'saved');
    } else {
      mainWindow.webContents.send('assembled-saved', 'error');
    }
  } catch (error) {
    console.error('Failed to save assembled sensor:', error);
    mainWindow.webContents.send('assembled-saved', 'error');
  }
}

/**
 * Delete assembled sensor
 */
function deleteAssembledSensorData(id) {
  try {
    const result = deleteAssembledSensor(id);
    if (result.success) {
      mainWindow.webContents.send('assembled-saved', 'deleted');
    } else {
      mainWindow.webContents.send('assembled-saved', 'error');
    }
  } catch (error) {
    console.error('Failed to delete assembled sensor:', error);
    mainWindow.webContents.send('assembled-saved', 'error');
  }
}

/**
 * Update assembled sensor
 */
function updateAssembledSensorData(updatedData) {
  try {
    const result = updateAssembledSensor(updatedData);
    if (result.success) {
      mainWindow.webContents.send('assembled-saved', 'updated');
    } else {
      mainWindow.webContents.send('assembled-saved', 'error');
    }
  } catch (error) {
    console.error('Failed to update assembled sensor:', error);
    mainWindow.webContents.send('assembled-saved', 'error');
  }
}

/**
 * Check for duplicate QR codes
 */
async function checkDuplicateQR(data) {
  try {
    return getDuplicateAssembly(data);
  } catch (error) {
    console.error('Failed to check duplicate QR:', error);
    return 'none';
  }
}

export {
  setAssemblyMainWindow,
  getAssembledSensors,
  saveAssembledSensorData,
  deleteAssembledSensorData,
  updateAssembledSensorData,
  checkDuplicateQR,
};
