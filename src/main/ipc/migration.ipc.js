import { ipcMain } from "electron";
import { getDatabase, getMigrationStatus } from '../db/index.js';
import { MigrationManager } from '../db/migration-manager.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Register Migration IPC handlers
 */
export function registerMigrationIpcHandlers() {
  // Get migration status
  ipcMain.handle("get-migration-status", async () => {
    try {
      const status = getMigrationStatus();
      
      return { 
        success: true, 
        status,
        isDevelopment: process.env.NODE_ENV === 'development'
      };
    } catch (error) {
      console.error("Failed to get migration status:", error);
      Sentry.captureException(error);
      return { success: false, error: error.message };
    }
  });

  // Run migrations
  ipcMain.handle("run-migrations", async () => {
    try {
      const db = getDatabase();
      const migrationManager = new MigrationManager(db);
      const result = migrationManager.runMigrations();
      
      return { success: true, result };
    } catch (error) {
      console.error("Failed to run migrations:", error);
      Sentry.captureException(error);
      return { success: false, error: error.message };
    }
  });
}
