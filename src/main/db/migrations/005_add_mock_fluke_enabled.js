/**
 * Migration 005: Add mock_fluke_enabled column
 * Adds the mock_fluke_enabled column to app_settings table for development mode
 */
export const migration = {
  version: 5,
  description: 'Add mock_fluke_enabled column to app_settings table',
  up: `
    ALTER TABLE app_settings ADD COLUMN mock_fluke_enabled INTEGER DEFAULT 0
  `,
  down: `
    -- Note: SQLite doesn't support DROP COLUMN, so we'll recreate the table
    -- This is a simplified rollback - in production, you'd want a more sophisticated approach
    CREATE TABLE app_settings_backup AS SELECT id, fluke_ip, fluke_port, created_at, updated_at FROM app_settings;
    DROP TABLE app_settings;
    CREATE TABLE app_settings AS SELECT * FROM app_settings_backup;
    DROP TABLE app_settings_backup;
  `
};
