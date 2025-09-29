import path from 'path';
import { app } from 'electron';
import Database from 'better-sqlite3';
import { sentryLogger } from '../loggers/sentry.logger.js';
import { MigrationManager } from './migration-manager.js';

// Store DB in user's app data directory
let dbPath = null;

let db = null;
let isInitialized = false;

/**
 * Initialize database with proper PRAGMAs and migrations
 */
export async function initializeDatabase() {
  if (isInitialized) {
    return db;
  }

  try {
    // Set database path if not already set
    if (!dbPath) {
      dbPath = path.join(app.getPath('userData'), 'calibration_settings.db');
    }

    console.log('Initializing database at:', dbPath);

    // Open database
    db = new Database(dbPath);

    // Enable WAL mode and other optimizations
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = MEMORY');

    // Run migrations using the new MigrationManager
    const migrationManager = new MigrationManager(db);
    const migrationResult = migrationManager.runMigrations();

    if (!migrationResult.success) {
      throw new Error(`Migration failed: ${migrationResult.error}`);
    }

    console.log(`Migrations completed: ${migrationResult.applied} applied, current version: ${migrationResult.currentVersion}`);

    isInitialized = true;
    console.log('Database initialized successfully');

    return db;
  } catch (error) {
    sentryLogger.handleError(error, {
      module: 'DATABASE',
      method: 'initializeDatabase',
    });
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Get database instance
 */
export function getDatabase() {
  if (!isInitialized) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Get migration status using the new MigrationManager
 */
export function getMigrationStatus() {
  if (!isInitialized) {
    return null;
  }

  try {
    const migrationManager = new MigrationManager(db);
    return migrationManager.getMigrationStatus();
  } catch (error) {
    console.error('Failed to get migration status:', error);
    sentryLogger.handleError(error, { module: 'DATABASE', method: 'getMigrationStatus' });
    return null;
  }
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db && isInitialized) {
    db.close();
    isInitialized = false;
    console.log('Database connection closed');
  }
}

/**
 * Get Fluke settings
 */
export function getFlukeSettings() {
  const db = getDatabase();
  try {
    const settings = db.prepare('SELECT fluke_ip, fluke_port, mock_fluke_enabled FROM app_settings ORDER BY id DESC LIMIT 1').get();
    return settings || { fluke_ip: '10.10.69.27', fluke_port: '5025', mock_fluke_enabled: 0 };
  } catch (error) {
    sentryLogger.handleError(error, {
      module: 'DATABASE',
      method: 'getFlukeSettings',
    });
    console.error('Failed to get fluke settings:', error);
    return { fluke_ip: '10.10.69.27', fluke_port: '5025', mock_fluke_enabled: 0 };
  }
}

/**
 * Save Fluke settings
 */
export function saveFlukeSettings(ip, port) {
  const db = getDatabase();
  try {
    const transaction = db.transaction(() => {
      const existingSettings = db.prepare('SELECT id FROM app_settings ORDER BY id DESC LIMIT 1').get();

      if (existingSettings) {
        // Update existing settings
        db.prepare(
          `
          UPDATE app_settings
          SET fluke_ip = ?, fluke_port = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
        ).run(ip, port, existingSettings.id);
      } else {
        // Insert new settings
        db.prepare(
          `
          INSERT INTO app_settings (fluke_ip, fluke_port)
          VALUES (?, ?)
        `
        ).run(ip, port);
      }
    });

    transaction();
    console.log(`Saved fluke settings - IP: ${ip}, Port: ${port}`);
    return { success: true, message: 'Settings saved successfully' };
  } catch (error) {
    sentryLogger.handleError(error, {
      module: 'DATABASE',
      method: 'saveFlukeSettings',
    });
    console.error('Failed to save fluke settings:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add command to history
 */
export function addCommandToHistory(type, content, relatedCommand = null) {
  const db = getDatabase();
  try {
    db.prepare(
      `
      INSERT INTO command_history (type, content, related_command)
      VALUES (?, ?, ?)
    `
    ).run(type, content, relatedCommand);

    // Keep history size manageable (delete old entries)
    db.prepare(
      `
      DELETE FROM command_history 
      WHERE id NOT IN (
        SELECT id FROM command_history 
        ORDER BY timestamp DESC 
        LIMIT 100
      )
    `
    ).run();

    return { success: true };
  } catch (error) {
    sentryLogger.handleError(error, {
      module: 'DATABASE',
      method: 'addCommandToHistory',
    });
    console.error('Failed to add command to history:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get command history
 */
export function getCommandHistory(limit = 50) {
  const db = getDatabase();
  try {
    return db
      .prepare(
        `
      SELECT type, content, related_command, timestamp
      FROM command_history
      ORDER BY timestamp DESC
      LIMIT ?
    `
      )
      .all(limit);
  } catch (error) {
    sentryLogger.handleError(error, {
      module: 'DATABASE',
      method: 'getCommandHistory',
    });
    console.error('Failed to get command history:', error);
    return [];
  }
}

/**
 * Clear command history
 */
export function clearCommandHistory() {
  const db = getDatabase();
  try {
    db.prepare('DELETE FROM command_history').run();
    return { success: true, message: 'Command history cleared' };
  } catch (error) {
    sentryLogger.handleError(error, {
      module: 'DATABASE',
      method: 'clearCommandHistory',
    });
    console.error('Failed to clear command history:', error);
    return { success: false, error: error.message };
  }
}

// Developer Settings Functions
export function getDeveloperSettings() {
  const db = getDatabase();
  try {
    const settings = db.prepare('SELECT mock_fluke_enabled FROM app_settings ORDER BY id DESC LIMIT 1').get();

    return {
      mockFlukeEnabled: settings?.mock_fluke_enabled === 1 || false,
    };
  } catch (error) {
    sentryLogger.handleError(error, {
      module: 'DATABASE',
      method: 'getDeveloperSettings',
    });
    console.error('Failed to get developer settings:', error);
    return {
      mockFlukeEnabled: false,
    };
  }
}

export function saveDeveloperSettings(settings) {
  const db = getDatabase();
  try {
    const transaction = db.transaction(() => {
      const existingSettings = db.prepare('SELECT id FROM app_settings ORDER BY id DESC LIMIT 1').get();

      if (existingSettings) {
        db.prepare(
          `
          UPDATE app_settings
          SET mock_fluke_enabled = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `
        ).run(settings.mockFlukeEnabled ? 1 : 0, existingSettings.id);
      } else {
        db.prepare(
          `
          INSERT INTO app_settings (mock_fluke_enabled)
          VALUES (?)
        `
        ).run(settings.mockFlukeEnabled ? 1 : 0);
      }
    });
    transaction();
    console.log(`Saved developer settings - Mock Fluke: ${settings.mockFlukeEnabled}`);
    return { success: true, message: 'Developer settings saved successfully' };
  } catch (error) {
    sentryLogger.handleError(error, {
      module: 'DATABASE',
      method: 'saveDeveloperSettings',
    });
    console.error('Failed to save developer settings:', error);
    return { success: false, error: error.message };
  }
}

// Don't initialize database on module load - wait for app to be ready
// initializeDatabase();
