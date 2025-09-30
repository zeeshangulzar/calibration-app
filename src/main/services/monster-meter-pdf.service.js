import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { BrowserWindow } from 'electron';
import Handlebars from 'handlebars';
import { MONSTER_METER_CONSTANTS } from '../../config/constants/monster-meter.constants.js';
import { GLOBAL_CONSTANTS } from '../../config/constants/global.constants.js';
import * as Sentry from '@sentry/electron/main';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MonsterMeterPDFService {
  constructor() {
    // Get current directory for ES modules
    // Set output directory to Desktop/Monster Meter PDF (like old app)
    this.baseOutputDir = path.join(os.homedir(), 'Desktop', 'Monster Meter PDF');
  }

  /**
   * Generate PDF report for Monster Meter verification
   * @param {Object} device - Device information
   * @param {Array} verificationData - Verification data array
   * @param {Object} summary - Verification summary
   * @param {string} testerName - Name of the tester who performed the verification
   * @param {string} model - Monster Meter model
   * @param {string} serialNumber - Device serial number
   * @returns {Promise<Object>} Result object with success status and file path
   */
  async generateMonsterMeterPDF(device, verificationData, summary, testerName, model, serialNumber, temperature) {
    try {
      // Generate report ID like old app
      const reportId = this.generateReportId(serialNumber);

      // Create date-based folder structure like old app
      const now = new Date();
      const dateFolder = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const dateFolderPath = path.join(this.baseOutputDir, dateFolder);

      // Ensure directories exist
      await this.ensureOutputDirectory(dateFolderPath);

      // Generate filename like old app: serial-date-time (12 hour format)
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

      const filename = `${serialNumber}-${dateStr}-${timeStr}.pdf`;
      const filePath = path.join(dateFolderPath, filename);

      // Generate report content using Handlebars template
      const reportContent = await this.generateReportContent(device, verificationData, summary, testerName, model, serialNumber, reportId, temperature);

      // Generate actual PDF using Electron's BrowserWindow
      const pdfBuffer = await this.generatePDFFromHTML(reportContent);
      await fs.writeFile(filePath, pdfBuffer);

      console.log(`Monster Meter PDF report generated successfully: ${filePath}`);

      return {
        success: true,
        filePath: filePath,
        filename: filename,
        reportId: reportId,
      };
    } catch (error) {
      console.error('Error generating Monster Meter PDF:', error);
      Sentry.captureException(error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Ensure the output directory structure exists
   * @param {string} directoryPath - Path to the directory to create
   */
  async ensureOutputDirectory(directoryPath) {
    try {
      await fs.mkdir(directoryPath, { recursive: true });
    } catch (error) {
      console.error('Error creating output directory:', error);
      throw error;
    }
  }

  /**
   * Generate report ID like old app
   * @param {string} serialNumber - Device serial number
   * @returns {string} Report ID
   */
  generateReportId(serialNumber) {
    const now = new Date();
    const year = now.getFullYear();
    return `MM-${serialNumber}-${year}`;
  }

  /**
   * Generate HTML report content using Handlebars template
   * @param {Object} device - Device information
   * @param {Array} verificationData - Verification data array
   * @param {Object} summary - Verification summary
   * @param {string} testerName - Tester name
   * @param {string} model - Monster Meter model
   * @param {string} serialNumber - Device serial number
   * @param {string} reportId - Report ID
   * @returns {Promise<string>} HTML content
   */
  async generateReportContent(device, verificationData, summary, testerName, model, serialNumber, reportId, temperature) {
    const now = new Date();
    const calDate = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const calDueDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    // Prepare certification data for template
    const certificationData = verificationData.map((point, index) => {
      const data = {
        target: point.referencePressure.toFixed(1),
        upper: point.upperLimit.toFixed(1),
        lower: point.lowerLimit.toFixed(1),
        voltageHi: point.voltageHi.toFixed(7),
        pressureHi: point.pressureHi.toFixed(1),
        voltageLo: point.voltageLo.toFixed(7),
        pressureLo: point.pressureLo.toFixed(1),
        result: point.inRange ? 'PASS' : 'FAIL',
        resultColor: point.inRange ? 'green' : 'red',
      };

      return data;
    });

    const templateData = {
      reportId: reportId,
      productDescription: `Monster Meter ${model}`,
      modelNumber: model,
      serialNumber: serialNumber,
      calDate: calDate,
      calDueDate: calDueDate,
      testerName: testerName,
      testDate: calDate,
      certificationData: certificationData,
      logoUrl: this.getLogoPath(),
      // Dynamic values from constants
      sweepValue: MONSTER_METER_CONSTANTS.SWEEP_VALUE,
      toleranceRange: MONSTER_METER_CONSTANTS.TOLERANCE_RANGE,
      calibrationTemperature: MONSTER_METER_CONSTANTS.CALIBRATION_TEMPERATURE,
      companyAddress: GLOBAL_CONSTANTS.COMPANY_ADDRESS,
      companyCityStateZip: GLOBAL_CONSTANTS.COMPANY_CITY_STATE_ZIP,
      companyPhone: GLOBAL_CONSTANTS.COMPANY_PHONE,
      companyEmail: GLOBAL_CONSTANTS.COMPANY_EMAIL,
      testLocation: GLOBAL_CONSTANTS.TEST_LOCATION,
      temperature: temperature,
    };

    return this.generateHTMLFromTemplate(templateData);
  }

  /**
   * Generate HTML content from Handlebars template
   * @param {Object} data - Template data
   * @returns {Promise<string>} HTML content
   */
  async generateHTMLFromTemplate(data) {
    try {
      // Load the Handlebars template
      const templatePath = path.join(__dirname, '../../assets/templates/monster-meter-report.hbs');
      const templateHtml = fsSync.readFileSync(templatePath, 'utf8');

      // Load the CSS file
      const cssPath = path.join(__dirname, '../../assets/stylesheets/monster-meter-report.css');
      const cssContent = fsSync.readFileSync(cssPath, 'utf8');

      // Replace the CSS link with inline styles
      const htmlWithInlineCSS = templateHtml.replace('<link rel="stylesheet" href="monster-meter-report.css" />', `<style>${cssContent}</style>`);

      // Compile the template
      const template = Handlebars.compile(htmlWithInlineCSS);

      // Generate HTML with data
      return template(data);
    } catch (error) {
      console.error('Error generating HTML from template:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  /**
   * Get logo path for PDF header
   * @returns {string} Base64 encoded logo or empty string
   */
  getLogoPath() {
    try {
      const logoPath = path.join(__dirname, '../../assets/images/hm_logo.svg');

      // Check if logo exists, if not return empty string
      if (!fsSync.existsSync(logoPath)) {
        console.warn('Logo file not found at:', logoPath);
        return '';
      }

      const logoBase64 = fsSync.readFileSync(logoPath, { encoding: 'base64' });
      return `data:image/svg+xml;base64,${logoBase64}`;
    } catch (error) {
      console.error('Error loading logo:', error);
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
        // Create hidden BrowserWindow (similar to old app)
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

export { MonsterMeterPDFService };
