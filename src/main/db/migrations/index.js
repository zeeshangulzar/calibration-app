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

import * as Sentry from '@sentry/electron/main';

// Import all migrations with descriptive names
import { migration as migration001 } from './001_initial_schema.js';
import { migration as migration002 } from './002_command_history.js';
import { migration as migration003 } from './003_device_assembly.js';
import { migration as migration004 } from './004_migration_table_structure.js';
import { migration as migration005 } from './005_add_mock_fluke_enabled.js';
import { migration as migration006 } from './006_gvi_gauges.js';
import { migration as migration007 } from './007_gvi_reports.js';
// Central registry of all migrations
const importedMigrations = [migration001, migration002, migration003, migration004, migration005, migration006, migration007];

/**
 * Comprehensive migration validation system
 *
 * This function validates that each migration has the correct structure,
 * required fields, and proper SQL content before allowing execution.
 */
function validateMigrationStructure(migration, filename) {
  // Check if migration object exists
  if (!migration) {
    const error = new Error(`---- Migration import failed: ${filename} - migration object is undefined`);
    Sentry.captureException(error, {
      tags: {
        operation: 'validate_migration_structure',
        migration_file: filename,
      },
    });
    throw error;
  }

  const checks = [
    { key: 'version', valid: v => typeof v === 'number' },
    { key: 'description', valid: v => typeof v === 'string' },
    { key: 'up', valid: v => (typeof v === 'string' && v.trim()) || (Array.isArray(v) && v.length > 0) },
    { key: 'down', valid: v => (typeof v === 'string' && v.trim()) || (Array.isArray(v) && v.length > 0) },
  ];

  for (const { key, valid } of checks) {
    if (!valid(migration[key])) {
      const error = new Error(`---- Migration validation failed: ${filename} - invalid or missing ${key}`);
      Sentry.captureException(error, {
        tags: {
          operation: 'validate_migration_structure',
          migration_file: filename,
        },
      });
      throw error;
    }
  }

  // Additional validation: Check SQL content for basic safety
  const upSQL = Array.isArray(migration.up) ? migration.up.join(' ').toLowerCase() : migration.up.trim().toLowerCase();
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
    const error = new Error('---- No migrations found - migration system cannot function');
    Sentry.captureException(error);
    throw error;
  }

  // Extract and validate version numbers
  const versions = migrations.map(m => m.version);
  const uniqueVersions = [...new Set(versions)];

  // Check for duplicate versions
  if (versions.length !== uniqueVersions.length) {
    const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i);
    const error = new Error(`---- Duplicate migration versions detected: ${[...new Set(duplicates)].join(', ')}`);
    Sentry.captureException(error);
    throw error;
  }

  // Check for missing versions (gaps in sequence)
  const sortedVersions = [...versions].sort((a, b) => a - b);
  const expectedVersions = Array.from({ length: Math.max(...sortedVersions) }, (_, i) => i + 1);
  const missingVersions = expectedVersions.filter(v => !versions.includes(v));

  if (missingVersions.length > 0) {
    console.warn(`---- Warning: Missing migration versions: ${missingVersions.join(', ')}`);
    console.warn('   This may indicate incomplete migration history');
  }

  // Validate version numbers are positive integers
  const invalidVersions = versions.filter(v => v <= 0 || !Number.isInteger(v));
  if (invalidVersions.length > 0) {
    const error = new Error(`---- Invalid migration versions detected: ${invalidVersions.join(', ')} - versions must be positive integers`);
    Sentry.captureException(error);
    throw error;
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
      const filename = Object.keys({ migration001, migration002, migration003, migration004, migration005 })[index];
      validateMigrationStructure(migration, filename);
    });

    // Validate version consistency across all migrations
    validateMigrationVersions(importedMigrations);

    console.log('---- All migrations validated successfully');
    return true;
  } catch (error) {
    console.error('---- Migration validation failed:', error.message);
    Sentry.captureException(error);
    throw error;
  }
}

// Execute validation during module load
validateAllMigrations();

// Sort migrations by version to ensure proper execution order
const migrations = importedMigrations.sort((a, b) => a.version - b.version);

// Export the sorted migrations array for the MigrationManager
export { migrations };
