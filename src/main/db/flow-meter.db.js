import { getDatabase } from './index.js';

export function getFlowMeterModels() {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT id, name, increasing_pressure, decreasing_pressure, allowed_tolerance FROM flow_meters ORDER BY name');
    const flowMeters = stmt.all();

    return flowMeters.map(meter => ({
      id: meter.id,
      name: meter.name,
      increasing_pressure: JSON.parse(meter.increasing_pressure),
      decreasing_pressure: JSON.parse(meter.decreasing_pressure),
      allowed_tolerance: meter.allowed_tolerance,
    }));
  } catch (error) {
    console.error('Error getting flow meter models:', error);
    throw new Error(`Failed to get flow meter models: ${error.message}`);
  }
}

/**
 * Get flow meter by ID
 * @param {number} id - Flow meter ID
 * @returns {Object|null} Flow meter object or null if not found
 */
export function getFlowMeterById(id) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT id, name, increasing_pressure, decreasing_pressure, allowed_tolerance FROM flow_meters WHERE id = ?');
    const meter = stmt.get(id);

    if (!meter) {
      return null;
    }

    return {
      id: meter.id,
      name: meter.name,
      increasing_pressure: JSON.parse(meter.increasing_pressure),
      decreasing_pressure: JSON.parse(meter.decreasing_pressure),
      allowed_tolerance: meter.allowed_tolerance,
    };
  } catch (error) {
    console.error('Error getting flow meter by ID:', error);
    throw new Error(`Failed to get flow meter: ${error.message}`);
  }
}

/**
 * Get flow meter by name
 * @param {string} name - Flow meter name
 * @returns {Object|null} Flow meter object or null if not found
 */
export function getFlowMeterByName(name) {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT id, name, increasing_pressure, decreasing_pressure, allowed_tolerance FROM flow_meters WHERE name = ?');
    const meter = stmt.get(name);

    if (!meter) {
      return null;
    }

    return {
      id: meter.id,
      name: meter.name,
      increasing_pressure: JSON.parse(meter.increasing_pressure),
      decreasing_pressure: JSON.parse(meter.decreasing_pressure),
      allowed_tolerance: meter.allowed_tolerance,
    };
  } catch (error) {
    console.error('Error getting flow meter by name:', error);
    throw new Error(`Failed to get flow meter: ${error.message}`);
  }
}
