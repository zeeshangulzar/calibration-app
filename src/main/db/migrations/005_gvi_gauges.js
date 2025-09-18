export const migration = {
  version: 5,
  description: 'Create GVI gauges table with ranges column',
  up: `
    CREATE TABLE IF NOT EXISTS gvi_gauges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model VARCHAR(50) NOT NULL UNIQUE,
      ranges TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_gvi_gauges_model ON gvi_gauges(model);
  `,
  down: `
    DROP TABLE IF EXISTS gvi_gauges;
    DROP INDEX IF EXISTS idx_gvi_gauges_model;
  `,
};
