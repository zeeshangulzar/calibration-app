export const migration = {
  version: 4,
  description: 'Update schema_migrations table structure',
  up: `
    -- Add missing columns to schema_migrations table if they don't exist
    ALTER TABLE schema_migrations ADD COLUMN description TEXT DEFAULT 'Legacy migration';
    ALTER TABLE schema_migrations ADD COLUMN applied_at DATETIME DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE schema_migrations ADD COLUMN checksum TEXT DEFAULT '';
    ALTER TABLE schema_migrations ADD COLUMN execution_time_ms INTEGER DEFAULT 0;
  `,
  down: `
    -- Remove added columns (not recommended for production)
    -- ALTER TABLE schema_migrations DROP COLUMN description;
    -- ALTER TABLE schema_migrations DROP COLUMN applied_at;
    -- ALTER TABLE schema_migrations DROP COLUMN checksum;
    -- ALTER TABLE schema_migrations DROP COLUMN execution_time_ms;
  `
};
