import { PAGINATION } from '../../config/constants/app.constants.js';
import {
  deleteAssembledSensor,
  getAllAssembledSensors,
  getDuplicateAssembly,
  saveAssembledSensor,
  updateAssembledSensor,
} from '../db/assembly-sensor.db.js';

/**
 * Get assembled sensors with pagination
 */
async function getAssembledSensors(page = PAGINATION.DEFAULT_PAGE, size = PAGINATION.DEFAULT_SIZE) {
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
async function saveAssembledSensorData(data) {
  try {
    const result = await saveAssembledSensor(data);
    return result;
  } catch (error) {
    console.error('Failed to save assembled sensor:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete assembled sensor
 */
async function deleteAssembledSensorData(id) {
  try {
    const result = await deleteAssembledSensor(id);
    return result;
  } catch (error) {
    console.error('Failed to delete assembled sensor:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update assembled sensor
 */
async function updateAssembledSensorData(updatedData) {
  try {
    const result = await updateAssembledSensor(updatedData);
    return result;
  } catch (error) {
    console.error('Failed to update assembled sensor:', error);
    return { success: false, error: error.message };
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
  getAssembledSensors,
  saveAssembledSensorData,
  deleteAssembledSensorData,
  updateAssembledSensorData,
  checkDuplicateQR,
};
