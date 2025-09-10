/**
 * Migration 003: Device Assembly
 * Creates the device_assembly table for sensor assembly tracking
 */
export const migration = {
  version: 3,
  description: 'Device assembly table for sensor assembly tracking',
  up: `
    CREATE TABLE IF NOT EXISTS device_assembly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plastic_body_qr TEXT NOT NULL,
      cap_qr TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  down: `
    DROP TABLE IF EXISTS device_assembly
  `
};
