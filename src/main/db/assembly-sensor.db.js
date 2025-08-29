import { getDatabase } from './index.js';

/**
 * Save assembled sensor
 */
export function saveAssembledSensor({ bodyQR, capQR }) {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      INSERT INTO device_assembly (plastic_body_qr, cap_qr)
      VALUES (?, ?)
    `);
    const result = stmt.run(bodyQR, capQR);
    console.log(`Saved assembled sensor: Body=${bodyQR}, Cap=${capQR}`);
    return { success: true, id: result.lastInsertRowid };
  } catch (error) {
    console.error('Failed to save assembled sensor:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get all assembled sensors with pagination
 */
export function getAllAssembledSensors(page = 1, size = 10) {
  const db = getDatabase();
  try {
    const offset = (page - 1) * size;
    const rows = db
      .prepare(
        `SELECT id, plastic_body_qr AS bodyQR, cap_qr AS capQR, created_at, updated_at
        FROM device_assembly 
        ORDER BY created_at DESC LIMIT ? OFFSET ?
        `
      )
      .all(size, offset);

    const totalCount = db
      .prepare("SELECT COUNT(*) AS count FROM device_assembly")
      .get().count;

    return { rows, totalCount };
  } catch (error) {
    console.error('Failed to get assembled sensors:', error);
    return { rows: [], totalCount: 0 };
  }
}

/**
 * Delete assembled sensor
 */
export function deleteAssembledSensor(id) {
  const db = getDatabase();
  try {
    const stmt = db.prepare('DELETE FROM device_assembly WHERE id = ?');
    const result = stmt.run(id);
    
    if (result.changes > 0) {
      console.log(`Deleted assembled sensor ID: ${id}`);
      return { success: true };
    } else {
      return { success: false, error: 'Sensor not found' };
    }
  } catch (err) {
    console.error('Failed to delete sensor:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update assembled sensor
 */
export function updateAssembledSensor({ id, bodyQR, capQR }) {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      UPDATE device_assembly
      SET plastic_body_qr = ?, cap_qr = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(bodyQR, capQR, id);
    
    if (result.changes > 0) {
      console.log(`Updated assembled sensor ID: ${id}`);
      return { success: true };
    } else {
      return { success: false, error: 'Sensor not found' };
    }
  } catch (err) {
    console.error('Failed to update sensor:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Check for duplicate assembly
 */
export function getDuplicateAssembly({ bodyQR, capQR }) {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
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
    console.error('Failed to check duplicate assembly:', error);
    return 'none';
  }
}
