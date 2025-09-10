/**
 * Migration 002: Command History
 * Creates the command_history table for storing Fluke commands
 */
export const migration = {
  version: 2,
  description: 'Command history table for Fluke commands',
  up: `
    CREATE TABLE IF NOT EXISTS command_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('command', 'response')),
      content TEXT NOT NULL,
      related_command TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  down: `
    DROP TABLE IF EXISTS command_history
  `
};
