export const migration = {
  version: 7,
  description: 'Create GVI reports table to store calibration results',
  up: [
    `CREATE TABLE IF NOT EXISTS gvi_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gvi_gauge_id INTEGER NOT NULL,
      status VARCHAR(10) NOT NULL CHECK (status IN ('PASS', 'FAIL')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      pdf_location TEXT,
      FOREIGN KEY (gvi_gauge_id) REFERENCES gvi_gauges(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_gvi_reports_gauge_id ON gvi_reports(gvi_gauge_id)`,
    `CREATE INDEX IF NOT EXISTS idx_gvi_reports_status ON gvi_reports(status)`,
    `CREATE INDEX IF NOT EXISTS idx_gvi_reports_created_at ON gvi_reports(created_at)`,
  ],
  down: [`DROP INDEX IF EXISTS idx_gvi_reports_created_at`, `DROP INDEX IF EXISTS idx_gvi_reports_status`, `DROP INDEX IF EXISTS idx_gvi_reports_gauge_id`, `DROP TABLE IF EXISTS gvi_reports`],
};
