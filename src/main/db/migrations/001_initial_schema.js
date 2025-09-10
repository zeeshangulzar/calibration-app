/**
 * Migration 001: Initial Schema
 * Creates the base app_settings table
 */
export const migration = {
  version: 1,
  description: 'Initial schema - app settings table',
  up: `
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fluke_ip TEXT DEFAULT '10.10.69.27',
      fluke_port TEXT DEFAULT '3490',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  down: `
    DROP TABLE IF EXISTS app_settings
  `
};
