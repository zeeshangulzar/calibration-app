export const migration = {
  version: 7,
  description: 'Create flow meters table',
  // increasing pressure and decreasing pressure are arrys of numbers
  up: [
    `CREATE TABLE IF NOT EXISTS flow_meters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(50) NOT NULL UNIQUE,
      increasing_pressure TEXT NOT NULL,
      decreasing_pressure TEXT NOT NULL,
      allowed_tolerance REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_flow_meters_model ON flow_meters(name)`,
  ],
  down: [`DROP INDEX IF EXISTS idx_flow_meters_model`, `DROP TABLE IF EXISTS flow_meters`],
};
