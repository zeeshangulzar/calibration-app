// This will be a new file to handle all database operations for Kraken reports.
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

const dbPath = path.join(app.getPath('userData'), 'kraken_calibration.db');
let db;

function initializeDatabase() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  const createReportsTable = `
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kraken_id TEXT NOT NULL,
      kraken_name TEXT,
      serial_number TEXT,
      tester_name TEXT,
      test_date TEXT NOT NULL,
      verification_data TEXT,
      certification_data TEXT,
      calibration_status TEXT DEFAULT 'pending'
    );
  `;
  db.exec(createReportsTable);
  
  // Check if serial_number column exists, if not add it
  try {
    db.prepare('SELECT serial_number FROM reports LIMIT 1').get();
  } catch (error) {
    if (error.message.includes('no column named serial_number')) {
      console.log('Adding serial_number column to existing reports table...');
      db.exec('ALTER TABLE reports ADD COLUMN serial_number TEXT');
    }
  }
}

function saveReport(reportData) {
  try {
    const {
      kraken_id,
      kraken_name,
      serial_number,
      tester_name,
      test_date,
      verification_data,
      certification_data,
      calibration_status,
    } = reportData;

    const stmt = db.prepare(
      'INSERT INTO reports (kraken_id, kraken_name, serial_number, tester_name, test_date, verification_data, certification_data, calibration_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(
      kraken_id,
      kraken_name,
      serial_number,
      tester_name,
      test_date,
      JSON.stringify(verification_data),
      JSON.stringify(certification_data),
      calibration_status
    );
    return { success: true, id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error saving report:', error);
    return { success: false, error: error.message };
  }
}

initializeDatabase();

export { saveReport };
