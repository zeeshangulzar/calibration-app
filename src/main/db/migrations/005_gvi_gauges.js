import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the GVI gauges data
const dataPath = path.join(__dirname, 'gvi-gauges-data.json');
const gviData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Generate INSERT statements for the data
function generateInsertStatements() {
  let statements = '';
  
  gviData.gvi_gauges.forEach(gauge => {
    gauge.points.forEach((point, index) => {
      const [gpm, psiMin, psiMax] = point;
      statements += `INSERT INTO gvi_gauges (model, step_order, gpm, psi_min, psi_max) VALUES ('${gauge.model}', ${index + 1}, ${gpm}, ${psiMin}, ${psiMax});\n`;
    });
  });
  
  return statements;
}

export const migration = {
  version: 5,
  description: 'Create GVI gauges table and populate with calibration data',
  up: `
    -- Create GVI gauges table
    CREATE TABLE IF NOT EXISTS gvi_gauges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model VARCHAR(50) NOT NULL,
      step_order INTEGER NOT NULL,
      gpm INTEGER NOT NULL,
      psi_min REAL NOT NULL,
      psi_max REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create index for better query performance
    CREATE INDEX IF NOT EXISTS idx_gvi_gauges_model ON gvi_gauges(model);
    CREATE INDEX IF NOT EXISTS idx_gvi_gauges_model_order ON gvi_gauges(model, step_order);

    -- Insert GVI gauge calibration data
    ${generateInsertStatements()}
  `,
  down: `
    -- Remove GVI gauges table
    DROP TABLE IF EXISTS gvi_gauges;
    DROP INDEX IF EXISTS idx_gvi_gauges_model;
    DROP INDEX IF EXISTS idx_gvi_gauges_model_order;
  `
};
