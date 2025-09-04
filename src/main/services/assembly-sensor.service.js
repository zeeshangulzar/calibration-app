import { PAGINATION } from '../../config/constants/global.constants.js';
import {
  deleteAssembledSensor,
  getAllAssembledSensors,
  getDuplicateAssembly,
  saveAssembledSensor
} from '../db/assembly-sensor.db.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Get assembled sensors with pagination
 */
async function getAssembledSensors(page = PAGINATION.DEFAULT_PAGE, size = PAGINATION.DEFAULT_SIZE) {
  try {
    return getAllAssembledSensors(page, size);
  } catch (error) {
    console.error('Failed to get assembled sensors:', error);
    Sentry.captureException(error);
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
    Sentry.captureException(error);
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
    Sentry.captureException(error);
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
    Sentry.captureException(error);
    return 'none';
  }
}

export {
  getAssembledSensors,
  saveAssembledSensorData,
  deleteAssembledSensorData,
  checkDuplicateQR,
};
