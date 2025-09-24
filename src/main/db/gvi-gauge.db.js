import { getDatabase } from './index.js';
import { sentryLogger } from '../loggers/sentry.logger.js';

/**
 * GVI Gauge Database Controller
 *
 * Manages all database operations related to GVI gauges
 */
export class GVIGaugeDb {
  constructor() {
    this.db = null;
  }

  getDb() {
    if (!this.db) {
      this.db = getDatabase();
    }
    return this.db;
  }

  /**
   * Get GVI gauge calibration steps by model
   */
  getGaugeSteps(model) {
    try {
      const gauge = this.getDb().prepare('SELECT ranges FROM gvi_gauges WHERE model = ?').get(model);

      if (!gauge || !gauge.ranges) {
        return [];
      }

      // Parse JSON ranges and convert to expected format
      const ranges = JSON.parse(gauge.ranges);
      return ranges.map(range => ({
        gpm: range.gpm,
        psiMin: range.psi_min,
        psiMax: range.psi_max,
        status: 'pending',
      }));
    } catch (error) {
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-gauge-db',
        method: 'getGaugeSteps',
        extra: { model },
      });
      console.error('Failed to get GVI gauge steps:', error);
      return [];
    }
  }

  /**
   * Get all available GVI gauge models
   */
  getGaugeModels() {
    try {
      const models = this.getDb().prepare('SELECT * FROM gvi_gauges').all();
      // Extract just the model names from the database objects
      return models.map(row => row.model);
    } catch (error) {
      console.error('[GVI DB] Error getting gauge models:', error);
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-gauge-db',
        method: 'getGaugeModels',
      });
      return [];
    }
  }

  /**
   * Get database instance (for advanced operations)
   */
  getDatabase() {
    return this.getDb();
  }
}

// Export singleton instance
export const gviGaugeDb = new GVIGaugeDb();

// Export individual methods for backward compatibility
export const getGVIGaugeSteps = (...args) => gviGaugeDb.getGaugeSteps(...args);
export const getGVIGaugeModels = (...args) => gviGaugeDb.getGaugeModels(...args);
