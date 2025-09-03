/**
 * Application Constants
 * 
 * This file contains common constants used throughout the application
 * to maintain consistency and make maintenance easier.
 */

// Pagination constants
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_SIZE: 20,
  MIN_SIZE: 1,
  MAX_SIZE: 100
};

// Database constants
export const DATABASE = {
  MIGRATIONS_TABLE: 'schema_migrations',
  DEFAULT_TIMEOUT: 30000
};

// Error messages
export const ERROR_MESSAGES = {
  DATABASE_CONNECTION_FAILED: 'Failed to connect to database',
  VALIDATION_FAILED: 'Validation failed',
  OPERATION_FAILED: 'Operation failed'
};

// Success messages
export const SUCCESS_MESSAGES = {
  OPERATION_COMPLETED: 'Operation completed successfully',
  DATA_SAVED: 'Data saved successfully',
  DATA_UPDATED: 'Data updated successfully',
  DATA_DELETED: 'Data deleted successfully'
};
