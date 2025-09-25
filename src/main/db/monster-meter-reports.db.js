import { getDatabase } from './index.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Monster Meter Reports Database Controller
 *
 * Manages all database operations related to Monster Meter reports
 */
export class MonsterMeterReportsDb {
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
   * Store a Monster Meter report in the database
   * @param {Object} reportData - The report data to store
   * @param {string} reportData.serialNumber - Serial number of the device
   * @param {string} reportData.status - Status of the verification (PASS/FAIL)
   * @param {string} reportData.pdfLocation - Path to the PDF file
   * @param {string} reportData.testerName - Name of the tester
   * @param {string} reportData.model - Model of the device
   * @returns {Promise<{success: boolean, id?: number, error?: string}>}
   */
  async storeReport(reportData) {
    try {
      const db = this.getDb();

      const { serialNumber, status, pdfLocation, testerName, model } = reportData;

      // Validate required fields
      if (!serialNumber || !status || !testerName || !model) {
        throw new Error('Missing required fields: serialNumber, status, testerName, and model are required');
      }

      const result = db
        .prepare(
          `
        INSERT INTO monster_meter_reports (serial_number, status, pdf_location, tester_name, model)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(serialNumber, status, pdfLocation, testerName, model);

      console.log(`Monster Meter report stored successfully with ID: ${result.lastInsertRowid}`);

      return {
        success: true,
        id: result.lastInsertRowid,
      };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'database', method: 'storeReport' },
        extra: { reportData },
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get all Monster Meter reports
   * @param {number} limit - Maximum number of reports to return (default: 100)
   * @returns {Promise<Array>} Array of report objects
   */
  async getAllReports(limit = 100) {
    try {
      const db = this.getDb();

      const reports = db
        .prepare(
          `
        SELECT id, serial_number, status, pdf_location, created_at, tester_name, model
        FROM monster_meter_reports
        ORDER BY created_at DESC
        LIMIT ?
      `
        )
        .all(limit);

      return reports;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'database', method: 'getAllReports' },
      });

      return [];
    }
  }

  /**
   * Get Monster Meter reports by serial number
   * @param {string} serialNumber - Serial number to search for
   * @returns {Promise<Array>} Array of report objects
   */
  async getReportsBySerialNumber(serialNumber) {
    try {
      const db = this.getDb();

      const reports = db
        .prepare(
          `
        SELECT id, serial_number, status, pdf_location, created_at, tester_name, model
        FROM monster_meter_reports
        WHERE serial_number = ?
        ORDER BY created_at DESC
      `
        )
        .all(serialNumber);

      return reports;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'database', method: 'getReportsBySerialNumber' },
        extra: { serialNumber },
      });

      return [];
    }
  }

  /**
   * Get Monster Meter reports by status
   * @param {string} status - Status to filter by (PASS/FAIL)
   * @returns {Promise<Array>} Array of report objects
   */
  async getReportsByStatus(status) {
    try {
      const db = this.getDb();

      const reports = db
        .prepare(
          `
        SELECT id, serial_number, status, pdf_location, created_at, tester_name, model
        FROM monster_meter_reports
        WHERE status = ?
        ORDER BY created_at DESC
      `
        )
        .all(status);

      return reports;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'database', method: 'getReportsByStatus' },
        extra: { status },
      });

      return [];
    }
  }

  /**
   * Delete a Monster Meter report by ID
   * @param {number} id - ID of the report to delete
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteReport(id) {
    try {
      const db = this.getDb();

      const result = db
        .prepare(
          `
        DELETE FROM monster_meter_reports
        WHERE id = ?
      `
        )
        .run(id);

      if (result.changes === 0) {
        return {
          success: false,
          error: 'Report not found',
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'database', method: 'deleteReport' },
        extra: { id },
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
export const monsterMeterReportsDb = new MonsterMeterReportsDb();
