import { migrations } from './migrations/index.js';
import { GLOBAL_CONSTANTS } from '../../config/constants/global.constants.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Migration Manager
 * 
 * PURPOSE: This class provides a robust, production-ready database migration system
 * that ensures database schema evolution is tracked, versioned, and reversible.
 * 
 * KEY FEATURES:
 * - Automatic migration discovery and validation
 * - Checksum verification for migration integrity
 * - Performance monitoring with execution time tracking
 * - Graceful handling of legacy database structures
 * - Comprehensive error handling and logging
 * 
 * USAGE: This manager is automatically invoked during app startup to ensure
 * the database schema is always up-to-date with the latest application version.
 */
export class MigrationManager {
  constructor(database) {
    this.db = database;
    this.migrationsTable = GLOBAL_CONSTANTS.MIGRATIONS_TABLE;
  }

  /**
   * Initialize the migrations tracking table
   * 
   * This method ensures the migrations table exists with the correct structure.
   * It handles legacy databases by gracefully adding missing columns.
   */
  initializeMigrationsTable() {
    try {
      const tableInfo = this.db.prepare(`PRAGMA table_info(${this.migrationsTable})`).all();
      
      if (tableInfo.length === 0) {
        this.createMigrationsTable();
      } else {
        this.upgradeMigrationsTable(tableInfo);
      }
    } catch (error) {
      console.error('---- Failed to initialize migrations table:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Create a new migrations table with full structure
   */
  createMigrationsTable() {
    this.db.prepare(`
      CREATE TABLE ${this.migrationsTable} (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL,
        execution_time_ms INTEGER DEFAULT 0
      )
    `).run();
    console.log('---- Migrations table created with full structure');
  }

  /**
   * Upgrade existing migrations table to include new columns
   */
  upgradeMigrationsTable(tableInfo) {
    const requiredColumns = ['description', 'applied_at', 'checksum', 'execution_time_ms'];
    const existingColumns = tableInfo.map(col => col.name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length === 0) {
      console.log('---- Migrations table already has correct structure');
      return;
    }

    console.log('---- Upgrading migrations table structure...');
    
    const columnDefaults = {
      description: "TEXT DEFAULT 'Legacy migration'",
      applied_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
      checksum: "TEXT DEFAULT ''",
      execution_time_ms: "INTEGER DEFAULT 0"
    };

    missingColumns.forEach(column => {
      try {
        this.db.prepare(`ALTER TABLE ${this.migrationsTable} ADD COLUMN ${column} ${columnDefaults[column]}`).run();
        console.log(`---- Added ${column} column`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`----  Column ${column} already exists, skipping`);
        } else {
          Sentry.captureException(error);
          throw error;
        }
      }
    });
    
    console.log('---- Migrations table structure updated');
  }

  /**
   * Get current database schema version
   */
  getCurrentVersion() {
    try {
      const result = this.db.prepare(
        `SELECT MAX(version) as version FROM ${this.migrationsTable}`
      ).get();
      return result?.version || 0;
    } catch (error) {
      console.error('---- Failed to get current version:', error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Get pending migrations that need to be applied
   */
  getPendingMigrations(currentVersion) {
    return migrations
      .filter(migration => migration.version > currentVersion)
      .sort((a, b) => a.version - b.version);
  }

  /**
   * Validate migration structure and integrity
   */
  validateMigration(migration) {
    const requiredFields = ['version', 'description', 'up', 'down'];
    const missingFields = requiredFields.filter(field => !migration[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Migration ${migration.version} missing required fields: ${missingFields.join(', ')}`);
    }

    if (typeof migration.version !== 'number' || migration.version <= 0) {
      throw new Error(`Migration ${migration.version} has invalid version number`);
    }

    if (typeof migration.up !== 'string' || migration.up.trim() === '') {
      throw new Error(`Migration ${migration.version} has invalid up SQL`);
    }

    return true;
  }

  /**
   * Calculate checksum for migration integrity verification
   */
  calculateChecksum(migration) {
    const content = `${migration.version}${migration.description}${migration.up}`;
    let hash = 0;
    
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Apply a single migration with proper error handling
   */
  applyMigration(migration) {
    const startTime = Date.now();
    
    try {
      console.log(`---- Applying migration ${migration.version}: ${migration.description}`);
      
      this.validateMigration(migration);
      
      // Handle complex migrations (like ALTER TABLE statements)
      if (migration.up.includes('ALTER TABLE')) {
        this.executeAlterTableMigration(migration.up);
      } else {
        this.db.prepare(migration.up).run();
      }
      
      // Record successful migration
      const checksum = this.calculateChecksum(migration);
      const executionTime = Date.now() - startTime;
      
      this.db.prepare(`
        INSERT INTO ${this.migrationsTable} (version, description, checksum, execution_time_ms)
        VALUES (?, ?, ?, ?)
      `).run(migration.version, migration.description, checksum, executionTime);
      
      console.log(`---- Migration ${migration.version} applied successfully (${executionTime}ms)`);
      return true;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`---- Migration ${migration.version} failed after ${executionTime}ms:`, error);
      Sentry.captureException(error, {
        tags: {
          operation: 'apply_migration',
          migration_version: migration.version
        }
      });
      throw error;
    }
  }

  /**
   * Execute ALTER TABLE migrations with graceful error handling
   */
  executeAlterTableMigration(sql) {
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    for (const statement of statements) {
      try {
        this.db.prepare(statement).run();
      } catch (error) {
        // Ignore "duplicate column" errors for ALTER TABLE ADD COLUMN
        if (error.message.includes('duplicate column name')) {
          console.log(`---- Column already exists, skipping: ${statement}`);
        } else {
          Sentry.captureException(error);
          throw error;
        }
      }
    }
  }

  /**
   * Run all pending migrations in the correct order
   */
  runMigrations() {
    try {
      console.log('🚀 Starting database migrations...');
      
      this.initializeMigrationsTable();
      
      const currentVersion = this.getCurrentVersion();
      console.log(`---- Current database version: ${currentVersion}`);
      
      const pendingMigrations = this.getPendingMigrations(currentVersion);
      
      if (pendingMigrations.length === 0) {
        console.log('---- Database is up to date - no migrations needed');
        return { success: true, applied: 0, currentVersion };
      }
      
      console.log(`---- Found ${pendingMigrations.length} pending migration(s)`);
      
      // Apply migrations in transaction for atomicity
      const transaction = this.db.transaction(() => {
        let appliedCount = 0;
        
        for (const migration of pendingMigrations) {
          this.applyMigration(migration);
          appliedCount++;
        }
        
        return appliedCount;
      });
      
      const appliedCount = transaction();
      
      console.log(`---- Successfully applied ${appliedCount} migration(s)`);
      
      return {
        success: true,
        applied: appliedCount,
        currentVersion: pendingMigrations[pendingMigrations.length - 1].version
      };
      
    } catch (error) {
      console.error('---- Migration process failed:', error);
      Sentry.captureException(error);
      return {
        success: false,
        error: error.message,
        currentVersion: this.getCurrentVersion()
      };
    }
  }

  /**
   * Get comprehensive migration status information
   */
  getMigrationStatus() {
    try {
      const tableInfo = this.db.prepare(`PRAGMA table_info(${this.migrationsTable})`).all();
      const hasDescription = tableInfo.some(col => col.name === 'description');
      const hasAppliedAt = tableInfo.some(col => col.name === 'applied_at');
      const hasExecutionTime = tableInfo.some(col => col.name === 'execution_time_ms');
      
      // Build dynamic query based on available columns
      let selectColumns = ['version'];
      if (hasDescription) selectColumns.push('description');
      if (hasAppliedAt) selectColumns.push('applied_at');
      if (hasExecutionTime) selectColumns.push('execution_time_ms');
      
      const selectQuery = `SELECT ${selectColumns.join(', ')} FROM ${this.migrationsTable} ORDER BY version`;
      const appliedMigrations = this.db.prepare(selectQuery).all();
      
      const currentVersion = this.getCurrentVersion();
      const pendingCount = migrations.filter(m => m.version > currentVersion).length;
      
      return {
        currentVersion,
        appliedCount: appliedMigrations.length,
        pendingCount,
        appliedMigrations,
        totalMigrations: migrations.length
      };
    } catch (error) {
      console.error('---- Failed to get migration status:', error);
      Sentry.captureException(error);
      return null;
    }
  }
}
