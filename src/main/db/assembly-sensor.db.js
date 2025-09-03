import { getDatabase } from './index.js';
import * as Sentry from '@sentry/node';

/**
 * Assembly Sensor Database Controller
 * 
 * Manages all database operations related to assembled sensors
 * using a class-based architecture for better organization and maintainability
 */
export class AssemblySensorController {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Save assembled sensor
   */
  async saveAssembledSensor({ bodyQR, capQR }) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO device_assembly (plastic_body_qr, cap_qr)
        VALUES (?, ?)
      `);
      const result = stmt.run(bodyQR, capQR);
      return { success: true, id: result.lastInsertRowid };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all assembled sensors with pagination
   */
  async getAllAssembledSensors(page = 1, size = 10) {
    try {
      const offset = (page - 1) * size;
      const rows = this.db
        .prepare(
          `SELECT id, plastic_body_qr AS bodyQR, cap_qr AS capQR, created_at, updated_at
          FROM device_assembly 
          ORDER BY created_at DESC LIMIT ? OFFSET ?
          `
        )
        .all(size, offset);

      const totalCount = this.db
        .prepare("SELECT COUNT(*) AS count FROM device_assembly")
        .get().count;

      return { rows, totalCount };
    } catch (error) {
      Sentry.captureException(error);
      return { rows: [], totalCount: 0 };
    }
  }

  /**
   * Delete assembled sensor
   */
  async deleteAssembledSensor(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM device_assembly WHERE id = ?');
      const result = stmt.run(id);
      
      if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false, error: 'Sensor not found' };
      }
    } catch (err) {
      Sentry.captureException(err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Update assembled sensor
   */
  async updateAssembledSensor({ id, bodyQR, capQR }) {
    try {
      const stmt = this.db.prepare(`
        UPDATE device_assembly
        SET plastic_body_qr = ?, cap_qr = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      const result = stmt.run(bodyQR, capQR, id);
      
      if (result.changes > 0) {
        return { success: true };
      } else {
        return { success: false, error: 'Sensor not found' };
      }
    } catch (err) {
      Sentry.captureException(err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Check for duplicate assembly
   */
  async getDuplicateAssembly({ bodyQR, capQR }) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          CASE 
            WHEN plastic_body_qr = ? AND cap_qr = ? THEN 'both'
            WHEN plastic_body_qr = ? THEN 'body'
            WHEN cap_qr = ? THEN 'cap'
            ELSE 'none'
          END as duplicate_type
        FROM device_assembly 
        WHERE plastic_body_qr = ? OR cap_qr = ?
        LIMIT 1
      `);
      
      const result = stmt.get(bodyQR, capQR, bodyQR, capQR, bodyQR, capQR);
      return result ? result.duplicate_type : 'none';
    } catch (error) {
      Sentry.captureException(error);
      return 'none';
    }
  }

  /**
   * Get database instance (for advanced operations)
   */
  getDatabase() {
    return this.db;
  }
}

// Export a singleton instance for backward compatibility
export const assemblySensorController = new AssemblySensorController();

// Export individual methods for backward compatibility
export const saveAssembledSensor = (...args) => assemblySensorController.saveAssembledSensor(...args);
export const getAllAssembledSensors = (...args) => assemblySensorController.getAllAssembledSensors(...args);
export const deleteAssembledSensor = (...args) => assemblySensorController.deleteAssembledSensor(...args);
export const updateAssembledSensor = (...args) => assemblySensorController.updateAssembledSensor(...args);
export const getDuplicateAssembly = (...args) => assemblySensorController.getDuplicateAssembly(...args);
