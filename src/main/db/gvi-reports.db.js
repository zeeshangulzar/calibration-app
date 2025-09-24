import { getDatabase } from './index.js';
import { sentryLogger } from '../loggers/sentry.logger.js';

/**
 * GVI Reports Database Controller
 *
 * Manages all database operations related to GVI calibration reports
 */
export class GVIReportsDb {
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
   * Get GVI gauge ID by model name
   */
  getGaugeIdByModel(model) {
    try {
      const result = this.getDb().prepare('SELECT id FROM gvi_gauges WHERE model = ?').get(model);
      return result ? result.id : null;
    } catch (error) {
      console.error('[GVI Reports DB] Error getting gauge ID by model:', error);
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-reports-db',
        method: 'getGaugeIdByModel',
      });
      return null;
    }
  }

  /**
   * Create a new GVI calibration report
   */
  createReport(gaugeModel, status, pdfLocation = null) {
    try {
      const gaugeId = this.getGaugeIdByModel(gaugeModel);
      if (!gaugeId) {
        throw new Error(`Gauge model '${gaugeModel}' not found`);
      }

      const insertStmt = this.getDb().prepare(`
        INSERT INTO gvi_reports (gvi_gauge_id, status, pdf_location) 
        VALUES (?, ?, ?)
      `);

      const result = insertStmt.run(gaugeId, status, pdfLocation);
      return { success: true, reportId: result.lastInsertRowid };
    } catch (error) {
      console.error('[GVI Reports DB] Error creating report:', error);
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-reports-db',
        method: 'createReport',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all reports for a specific gauge model
   */
  getReportsByModel(model) {
    try {
      const gaugeId = this.getGaugeIdByModel(model);
      if (!gaugeId) {
        return [];
      }

      const reports = this.getDb()
        .prepare(
          `
        SELECT r.*, g.model as gauge_model 
        FROM gvi_reports r 
        JOIN gvi_gauges g ON r.gvi_gauge_id = g.id 
        WHERE r.gvi_gauge_id = ? 
        ORDER BY r.created_at DESC
      `
        )
        .all(gaugeId);

      return reports;
    } catch (error) {
      console.error('[GVI Reports DB] Error getting reports by model:', error);
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-reports-db',
        method: 'getReportsByModel',
      });
      return [];
    }
  }

  /**
   * Get all reports with pagination
   */
  getAllReports(limit = 50, offset = 0) {
    try {
      const reports = this.getDb()
        .prepare(
          `
        SELECT r.*, g.model as gauge_model 
        FROM gvi_reports r 
        JOIN gvi_gauges g ON r.gvi_gauge_id = g.id 
        ORDER BY r.created_at DESC 
        LIMIT ? OFFSET ?
      `
        )
        .all(limit, offset);

      return reports;
    } catch (error) {
      console.error('[GVI Reports DB] Error getting all reports:', error);
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-reports-db',
        method: 'getAllReports',
      });
      return [];
    }
  }

  /**
   * Get report by ID
   */
  getReportById(reportId) {
    try {
      const report = this.getDb()
        .prepare(
          `
        SELECT r.*, g.model as gauge_model 
        FROM gvi_reports r 
        JOIN gvi_gauges g ON r.gvi_gauge_id = g.id 
        WHERE r.id = ?
      `
        )
        .get(reportId);

      return report;
    } catch (error) {
      console.error('[GVI Reports DB] Error getting report by ID:', error);
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-reports-db',
        method: 'getReportById',
      });
      return null;
    }
  }

  /**
   * Update PDF location for a report
   */
  updateReportPdfLocation(reportId, pdfLocation) {
    try {
      const updateStmt = this.getDb().prepare(`
        UPDATE gvi_reports 
        SET pdf_location = ? 
        WHERE id = ?
      `);

      const result = updateStmt.run(pdfLocation, reportId);
      return { success: true, changes: result.changes };
    } catch (error) {
      console.error('[GVI Reports DB] Error updating report PDF location:', error);
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-reports-db',
        method: 'updateReportPdfLocation',
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a report
   */
  deleteReport(reportId) {
    try {
      const deleteStmt = this.getDb().prepare('DELETE FROM gvi_reports WHERE id = ?');
      const result = deleteStmt.run(reportId);
      return { success: true, changes: result.changes };
    } catch (error) {
      console.error('[GVI Reports DB] Error deleting report:', error);
      sentryLogger.handleError(error, {
        module: 'gvi',
        service: 'gvi-reports-db',
        method: 'deleteReport',
      });
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
export const gviReportsDb = new GVIReportsDb();
