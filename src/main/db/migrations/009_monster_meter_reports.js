/**
 * Migration 007: Monster Meter Reports Table
 * Creates the monster_meter_reports table for storing verification reports
 */
export const migration = {
  version: 9,
  description: 'Monster Meter Reports table for storing verification reports',
  up: `
    CREATE TABLE IF NOT EXISTS monster_meter_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_number TEXT NOT NULL,
      status TEXT NOT NULL,
      pdf_location TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      tester_name TEXT NOT NULL,
      model TEXT NOT NULL
    )
  `,
  down: `
    DROP TABLE IF EXISTS monster_meter_reports
  `,
};
