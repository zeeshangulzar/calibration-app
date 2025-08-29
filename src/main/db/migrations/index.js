/**
 * Migration Index
 * 
 * PURPOSE: This file serves as the central registry and validation system for all database migrations.
 * It ensures that migrations are properly structured, versioned, and can be safely executed.
 * 
 * KEY RESPONSIBILITIES:
 * - Import and validate all migration files
 * - Ensure version consistency and sequencing
 * - Provide migration discovery for the MigrationManager
 * - Validate migration structure and integrity
 * - Export migrations in the correct order
 * 
 * IMPORTANT: When adding new migration files, make sure to:
 * 1. Import them here with proper naming
 * 2. Add them to the importedMigrations array
 * 3. Include them in the validation calls
 * 4. Export them individually for debugging/testing
 */

// Import all migrations with descriptive names
import { migration as migration001 } from './001_initial_schema.js';
import { migration as migration002 } from './002_command_history.js';
import { migration as migration003 } from './003_device_assembly.js';
import { migration as migration004 } from './004_migration_table_structure.js';

// Central registry of all migrations
const importedMigrations = [
  migration001,
  migration002,
  migration003,
  migration004
];

/**
 * Comprehensive migration validation system
 * 
 * This function validates that each migration has the correct structure,
 * required fields, and proper SQL content before allowing execution.
 */
function validateMigrationStructure(migration, filename) {
  // Check if migration object exists
  if (!migration) {
    throw new Error(`---- Migration import failed: ${filename} - migration object is undefined`);
  }
  
  // Validate version field
  if (!migration.version || typeof migration.version !== 'number') {
    throw new Error(`---- Migration validation failed: ${filename} - invalid or missing version`);
  }
  
  // Validate description field
  if (!migration.description || typeof migration.description !== 'string') {
    throw new Error(`---- Migration validation failed: ${filename} - invalid or missing description`);
  }
  
  // Validate up SQL (required for applying migration)
  if (!migration.up || typeof migration.up !== 'string' || migration.up.trim() === '') {
    throw new Error(`---- Migration validation failed: ${filename} - invalid or missing up SQL`);
  }
  
  // Validate down SQL (required for rollback)
  if (!migration.down || typeof migration.down !== 'string' || migration.down.trim() === '') {
    throw new Error(`---- Migration validation failed: ${filename} - invalid or missing down SQL`);
  }
  
  // Additional validation: Check SQL content for basic safety
  const upSQL = migration.up.trim().toLowerCase();
  if (upSQL.includes('drop table') && !upSQL.includes('if exists')) {
    console.warn(`---- Warning: ${filename} contains DROP TABLE without IF EXISTS - this could be dangerous`);
  }
  
  return true;
}

/**
 * Validate migration version consistency and sequencing
 */
function validateMigrationVersions(migrations) {
  if (migrations.length === 0) {
    throw new Error('---- No migrations found - migration system cannot function');
  }
  
  // Extract and validate version numbers
  const versions = migrations.map(m => m.version);
  const uniqueVersions = [...new Set(versions)];
  
  // Check for duplicate versions
  if (versions.length !== uniqueVersions.length) {
    const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i);
    throw new Error(`---- Duplicate migration versions detected: ${[...new Set(duplicates)].join(', ')}`);
  }
  
  // Check for missing versions (gaps in sequence)
  const sortedVersions = [...versions].sort((a, b) => a - b);
  const expectedVersions = Array.from(
    { length: Math.max(...sortedVersions) }, 
    (_, i) => i + 1
  );
  const missingVersions = expectedVersions.filter(v => !versions.includes(v));
  
  if (missingVersions.length > 0) {
    console.warn(`---- Warning: Missing migration versions: ${missingVersions.join(', ')}`);
    console.warn('   This may indicate incomplete migration history');
  }
  
  // Validate version numbers are positive integers
  const invalidVersions = versions.filter(v => v <= 0 || !Number.isInteger(v));
  if (invalidVersions.length > 0) {
    throw new Error(`---- Invalid migration versions detected: ${invalidVersions.join(', ')} - versions must be positive integers`);
  }
  
  return true;
}

/**
 * Comprehensive validation of all migrations
 */
function validateAllMigrations() {
  try {
    console.log('🔍 Starting migration validation...');
    
    // Validate each individual migration
    importedMigrations.forEach((migration, index) => {
      const filename = Object.keys({ migration001, migration002, migration003, migration004 })[index];
      validateMigrationStructure(migration, filename);
    });
    
    // Validate version consistency across all migrations
    validateMigrationVersions(importedMigrations);
    
    console.log('---- All migrations validated successfully');
    return true;
    
  } catch (error) {
    console.error('---- Migration validation failed:', error.message);
    throw error;
  }
}

// Execute validation during module load
try {
  validateAllMigrations();
} catch (error) {
  // Re-throw to prevent app startup with invalid migrations
  throw error;
}

// Sort migrations by version to ensure proper execution order
const migrations = importedMigrations.sort((a, b) => a.version - b.version);

// Export the sorted migrations array for the MigrationManager
export { migrations };

// Export individual migrations for testing, debugging, and direct access
export { 
  migration001, 
  migration002, 
  migration003, 
  migration004 
};

// Export validation functions for testing purposes
export { 
  validateMigrationStructure, 
  validateMigrationVersions, 
  validateAllMigrations 
};
