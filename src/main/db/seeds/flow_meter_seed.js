const flowMeterData = [
  {
    name: '0-30 2.5"',
    increasing_pressure: [5, 10, 15, 20, 25],
    decreasing_pressure: [20, 15, 10, 5],
    allowed_tolerance: 0.3,
  },
  {
    name: '0-60 2.5"',
    increasing_pressure: [10, 20, 30, 40, 50],
    decreasing_pressure: [40, 30, 20, 10],
    allowed_tolerance: 0.6,
  },
  {
    name: '0-100 2.5"',
    increasing_pressure: [10, 30, 50, 70, 80],
    decreasing_pressure: [70, 50, 30, 10],
    allowed_tolerance: 1,
  },
  {
    name: '0-160 2.5"',
    increasing_pressure: [20, 50, 80, 110, 140],
    decreasing_pressure: [110, 80, 50, 20],
    allowed_tolerance: 1.6,
  },
  {
    name: '0-200 2.5"',
    increasing_pressure: [20, 50, 100, 150, 180],
    decreasing_pressure: [150, 100, 50, 20],
    allowed_tolerance: 2,
  },
  {
    name: '0-30 4"',
    increasing_pressure: [5, 10, 15, 20, 25],
    decreasing_pressure: [20, 15, 10, 5],
    allowed_tolerance: 0.15,
  },
  {
    name: '0-60 4"',
    increasing_pressure: [10, 20, 30, 40, 50],
    decreasing_pressure: [40, 30, 20, 10],
    allowed_tolerance: 0.3,
  },
  {
    name: '0-100 4"',
    increasing_pressure: [10, 30, 50, 70, 80],
    decreasing_pressure: [70, 50, 30, 10],
    allowed_tolerance: 0.5,
  },
  {
    name: '0-160 4"',
    increasing_pressure: [20, 50, 80, 110, 140],
    decreasing_pressure: [110, 80, 50, 20],
    allowed_tolerance: 0.8,
  },
  {
    name: '0-200 4"',
    increasing_pressure: [20, 50, 100, 150, 180],
    decreasing_pressure: [150, 100, 50, 20],
    allowed_tolerance: 1,
  },
  {
    name: '0-300 4"',
    increasing_pressure: [50, 100, 150, 200, 250],
    decreasing_pressure: [200, 150, 100, 50],
    allowed_tolerance: 1.5,
  },
  {
    name: '0-400 4"',
    increasing_pressure: [50, 150, 250, 350, 380],
    decreasing_pressure: [350, 250, 150, 50],
    allowed_tolerance: 1.5,
  },
  {
    name: '0-600 4"',
    increasing_pressure: [100, 200, 300, 400, 480],
    decreasing_pressure: [400, 300, 200, 100],
    allowed_tolerance: 3,
  },
  {
    name: '-30-100 4"',
    increasing_pressure: [10, 30, 50, 70, 80],
    decreasing_pressure: [70, 50, 30, 10],
    allowed_tolerance: 0.5,
  },
  {
    name: '-30-160 4"',
    increasing_pressure: [20, 50, 80, 110, 140],
    decreasing_pressure: [110, 80, 50, 20],
    allowed_tolerance: 0.8,
  },
  {
    name: '-30-200 4"',
    increasing_pressure: [20, 50, 100, 150, 180],
    decreasing_pressure: [150, 100, 50, 20],
    allowed_tolerance: 1,
  },
  {
    name: '-30-300 4"',
    increasing_pressure: [50, 100, 150, 200, 250],
    decreasing_pressure: [200, 150, 100, 50],
    allowed_tolerance: 1.5,
  },
  {
    name: 'NEWBB',
    increasing_pressure: [11, 23, 35, 41, 50],
    decreasing_pressure: [41, 35, 23, 11],
    allowed_tolerance: 0.3,
  },
  {
    name: 'OLDBB',
    increasing_pressure: [9.8, 18.1, 24.9, 31.2, 41.6],
    decreasing_pressure: [31.2, 24.9, 18.1, 9.8],
    allowed_tolerance: 0.3,
  },
];

export async function seed(db) {
  // Check if any data exists first for early exit
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM flow_meters').get().count;
  if (existingCount > 0) {
    return { inserted: 0, skipped: flowMeterData.length };
  }

  // Prepare statements once
  const insertStmt = db.prepare('INSERT INTO flow_meters (name, increasing_pressure, decreasing_pressure, allowed_tolerance) VALUES (?, ?, ?, ?)');

  // Use transaction for batch insert - much faster
  const insertMany = db.transaction(() => {
    let inserted = 0;
    for (const meter of flowMeterData) {
      insertStmt.run(meter.name, JSON.stringify(meter.increasing_pressure), JSON.stringify(meter.decreasing_pressure), meter.allowed_tolerance);
      inserted++;
    }
    return inserted;
  });

  const inserted = insertMany();
  return { inserted, skipped: 0 };
}

export { flowMeterData };
