import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { BrowserWindow } from 'electron';
import Handlebars from 'handlebars';
import { GVI_CONSTANTS } from '../../config/constants/gvi.constants.js';
import { GLOBAL_CONSTANTS } from '../../config/constants/global.constants.js';
import * as Sentry from '@sentry/electron/main';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GVIPDFService {
  constructor() {
    // Set output directory to Desktop/GVI pdf
    this.baseOutputDir = path.join(os.homedir(), 'Desktop', GVI_CONSTANTS.PDF_OUTPUT_DIR);
  }

  /**
   * Generate PDF report for GVI Flow Meter calibration
   * @param {Object} calibrationData - Calibration data object
   * @param {string} calibrationData.model - GVI model
   * @param {string} calibrationData.tester - Tester name
   * @param {string} calibrationData.serialNumber - Device serial number
   * @param {boolean} calibrationData.passed - Whether calibration passed
   * @param {Array} calibrationData.steps - Calibration steps array
   * @param {Array} calibrationData.results - Test results array
   * @returns {Promise<Object>} Result object with success status and file path
   */
  async generateGVIPDF(calibrationData) {
    try {
      // Generate report ID
      const reportId = this.generateReportId(calibrationData.serialNumber);

      // Create date-based folder structure
      const now = new Date();
      const dateFolder = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const dateFolderPath = path.join(this.baseOutputDir, dateFolder);

      // Ensure directories exist
      await this.ensureOutputDirectory(dateFolderPath);

      // Generate filename: GVI_Model_Serial_Date_Time.pdf
      const dateStr = now
        .toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        .replace(/\//g, '-');
      const timeStr = now
        .toLocaleTimeString('en-US', {
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
        .replace(/:/g, '-')
        .replace(/\s/g, '');

      const filename = `${calibrationData.serialNumber}_${dateStr}_${timeStr}.pdf`;
      const sanitizedFilename = this.sanitizeFilename(filename);
      const filePath = path.join(dateFolderPath, sanitizedFilename);

      // Generate report content using Handlebars template
      const reportContent = await this.generateReportContent(calibrationData, reportId);

      // Generate actual PDF using Electron's BrowserWindow
      const pdfBuffer = await this.generatePDFFromHTML(reportContent);
      await fs.writeFile(filePath, pdfBuffer);

      console.log(`GVI PDF report generated successfully: ${filePath}`);

      return {
        success: true,
        filePath: filePath,
        filename: sanitizedFilename,
        reportId: reportId,
      };
    } catch (error) {
      console.error('Error generating GVI PDF:', error);
      Sentry.captureException(error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate report ID based on serial number and timestamp
   * @param {string} serialNumber - Device serial number
   * @returns {string} Report ID
   */
  generateReportId(serialNumber) {
    const now = new Date();
    // use last date string instead of timestamp
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return `GVI-${serialNumber}-${dateStr}`;
  }

  /**
   * Ensure output directory exists
   * @param {string} dirPath - Directory path to ensure exists
   */
  async ensureOutputDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      console.error('Error creating output directory:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Sanitize filename for Windows compatibility
   * @param {string} filename - Filename to sanitize
   * @returns {string} Sanitized filename
   */
  sanitizeFilename(filename) {
    // Remove or replace characters that are not allowed in Windows filenames
    return filename
      .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid characters with dash
      .replace(/\s+/g, '-') // Replace spaces with dash
      .replace(/-+/g, '-') // Replace multiple dashes with single dash
      .replace(/^-|-$/g, ''); // Remove leading/trailing dashes
  }

  /**
   * Generate report content using Handlebars template
   * @param {Object} calibrationData - Calibration data
   * @param {string} reportId - Report ID
   * @returns {Promise<string>} HTML content
   */
  async generateReportContent(calibrationData, reportId) {
    try {
      // Load Handlebars template
      const templatePath = path.join(__dirname, '../../assets/templates/gvi-report.hbs');
      console.log('Template path:', templatePath);
      const templateHtml = fsSync.readFileSync(templatePath, 'utf8');

      // Load the CSS file
      const cssPath = path.join(__dirname, '../../assets/stylesheets/gvi-report.css');
      const cssContent = fsSync.readFileSync(cssPath, 'utf8');

      // Replace the CSS link with inline styles
      const htmlWithInlineCSS = templateHtml.replace('<link rel="stylesheet" href="gvi-report.css" />', `<style>${cssContent}</style>`);

      // Compile the template
      const template = Handlebars.compile(htmlWithInlineCSS);

      // Prepare data for template
      const now = new Date();

      const templateData = {
        reportId: reportId,
        model: calibrationData.model,
        tester: calibrationData.tester,
        serialNumber: calibrationData.serialNumber,
        passed: calibrationData.passed,
        result: calibrationData.passed ? 'PASS' : 'FAIL',
        resultColor: calibrationData.passed ? 'green' : 'red',
        testDate: now.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        testTime: now.toLocaleTimeString('en-US', {
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        calibrationSteps: calibrationData.steps || [],
        testResults: calibrationData.results || [],
        calibrationTemperature: GVI_CONSTANTS.CALIBRATION_TEMPERATURE,
        logoUrl: this.getLogoPath(),
        companyName: GVI_CONSTANTS.COMPANY_NAME,
        companyAddress: GLOBAL_CONSTANTS.COMPANY_ADDRESS,
        companyCityStateZip: GLOBAL_CONSTANTS.COMPANY_CITY_STATE_ZIP,
        companyPhone: GLOBAL_CONSTANTS.COMPANY_PHONE,
        companyEmail: GLOBAL_CONSTANTS.COMPANY_EMAIL,
        reportTitle: GVI_CONSTANTS.REPORT_TITLE,
      };

      return template(templateData);
    } catch (error) {
      console.error('Error generating report content:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get logo path for the report
   * @returns {string} Logo path
   */
  getLogoPath() {
    try {
      const logoPath = path.join(__dirname, '../../assets/images/gvi_logo.png');
      console.log('Logo path:', logoPath);
      if (!fsSync.existsSync(logoPath)) {
        console.warn('Logo file not found at:', logoPath);
        return '';
      }

      const logoBase64 = fsSync.readFileSync(logoPath, { encoding: 'base64' });
      return `data:image/jpeg;base64,${logoBase64}`;
    } catch (error) {
      console.error('Error getting logo path:', error);
      Sentry.captureException(error);
      return '';
    }
  }

  /**
   * Generate PDF from HTML content using Electron's built-in BrowserWindow
   * @param {string} htmlContent - HTML content to convert
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generatePDFFromHTML(htmlContent) {
    return new Promise((resolve, reject) => {
      try {
        // Create hidden BrowserWindow
        const win = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
          },
        });

        // Load the rendered HTML into the window
        win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(htmlContent)}`);

        // Wait for content to load, then generate PDF
        win.webContents.once('did-finish-load', async () => {
          try {
            // Generate PDF using Electron's built-in method
            const pdfBuffer = await win.webContents.printToPDF({
              pageSize: 'A4',
              printBackground: true,
              marginsType: 1, // default margins
            });

            win.close();
            resolve(pdfBuffer);
          } catch (error) {
            win.close();
            Sentry.captureException(error);
            reject(error);
          }
        });

        // Handle load errors
        win.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
          win.close();
          reject(new Error(`Failed to load HTML content: ${errorDescription}`));
        });
      } catch (error) {
        console.error('Error creating BrowserWindow for PDF generation:', error);
        Sentry.captureException(error);
        reject(error);
      }
    });
  }
}

// Singleton instance
let gviPDFServiceInstance = null;

export function getGVIPDFService() {
  if (!gviPDFServiceInstance) {
    gviPDFServiceInstance = new GVIPDFService();
  }
  return gviPDFServiceInstance;
}

export { GVIPDFService };
