import { seed as seedGVIRanges } from './gvi_ranges.seed.js';

export async function runAllSeeds(db) {
  if (!db) {
    throw new Error('Database instance required for seeding');
  }

  try {
    // Run GVI ranges seed
    const gviResult = await seedGVIRanges(db);

    if (gviResult.inserted > 0) {
      console.log(`Database seeded: ${gviResult.inserted} GVI ranges inserted`);
    } else if (gviResult.skipped > 0) {
      console.log('Database already seeded, skipping');
    }

    return { success: true, results: { gviRanges: gviResult } };
  } catch (error) {
    console.error('Seeding failed:', error);
    return { success: false, error: error.message };
  }
}
