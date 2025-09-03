import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { BrowserWindow } from 'electron';
import Handlebars from 'handlebars';
import { GLOBAL_CONSTANTS } from '../../config/constants/global.constants.js';
import { KRAKEN_CONSTANTS } from '../../config/constants/kraken.constants.js';

class KrakenPDFService {
  constructor() {
    // Get current directory for ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    this.templatePath = path.join(__dirname, '../../assets/templates/kraken-report.hbs');
    this.outputDir = path.join(os.homedir(), 'Desktop', 'kraken_pdfs');
  }

  /**
   * Generate PDF report for a kraken device
   * @param {Object} device - Device information
   * @param {Array} deviceData - Verification data array
   * @param {Object} certificationResult - Certification result object
   * @param {string} testerName - Name of the tester who performed the calibration
   * @returns {Promise<Object>} Result object with success status and file path
   */
  async generateKrakenPDF(device, deviceData, certificationResult, testerName) {
    try {
      // Ensure output directory exists
      await this.ensureOutputDirectory(device.displayName || device.id);

      // Generate report content
      const reportContent = await this.generateReportContent(device, deviceData, certificationResult, testerName);

      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `${device.displayName || device.id}-${timestamp}.pdf`;
      const filePath = path.join(this.outputDir, device.displayName || device.id, filename);

      // Generate actual PDF using Puppeteer
      const pdfBuffer = await this.generatePDFFromHTML(reportContent);
      await fs.writeFile(filePath, pdfBuffer);

      console.log(`PDF report generated successfully: ${filePath}`);

      return {
        success: true,
        filePath: filePath,
        filename: filename,
      };
    } catch (error) {
      console.error('Error generating kraken PDF:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Ensure the output directory structure exists
   * @param {string} deviceName - Device name for subfolder
   */
  async ensureOutputDirectory(deviceName) {
    try {
      // Create main kraken_pdfs directory
      await fs.mkdir(this.outputDir, { recursive: true });

      // Create device-specific subfolder
      const deviceDir = path.join(this.outputDir, deviceName);
      await fs.mkdir(deviceDir, { recursive: true });
    } catch (error) {
      console.error('Error creating output directory:', error);
      throw error;
    }
  }

  /**
   * Generate the report content using Handlebars template
   * @param {Object} device - Device information
   * @param {Array} deviceData - Verification data array
   * @param {Object} certificationResult - Certification result object
   * @param {string} testerName - Name of the tester who performed the calibration
   * @returns {Promise<string>} HTML content string
   */
  async generateReportContent(device, deviceData, certificationResult, testerName) {
    let template;
    const templateContent = await fs.readFile(this.templatePath, 'utf8');
    template = Handlebars.compile(templateContent);

    // Prepare data for template
    const templateData = this.prepareTemplateData(device, deviceData, certificationResult, testerName);

    // Generate HTML content
    return template(templateData);
  }

  /**
   * Prepare data for template rendering
   * @param {Object} device - Device information
   * @param {Array} deviceData - Verification data array
   * @param {Object} certificationResult - Certification result object
   * @param {string} testerName - Name of the tester who performed the calibration
   * @returns {Object} Template data object
   */
  prepareTemplateData(device, deviceData, certificationResult, testerName = 'SmartMonster Calibration System') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const reportId = `${device.serialNumber}-${timestamp}`;

    // Get current date and calculate due date (1 year from now)
    const currentDate = new Date();
    const dueDate = new Date(currentDate);
    dueDate.setFullYear(dueDate.getFullYear() + 1);

    // Process certification data for the table
    const certificationData = deviceData.map(reading => {
      const discrepancy = Math.abs(reading.krakenPressure - reading.flukePressure);
      const passed = discrepancy <= 1.5;

      return {
        target: reading.flukePressure.toFixed(1),
        reading: reading.krakenPressure.toFixed(1),
        discrepancy: discrepancy.toFixed(1),
        result: passed ? 'PASS' : 'FAIL',
        resultColor: passed ? '#000000' : '#ff0000',
      };
    });

    return {
      // Logo and company info
      logoUrl: this.getLogoPath(),
      companyAddress: GLOBAL_CONSTANTS.COMPANY_ADDRESS,
      companyArea: GLOBAL_CONSTANTS.COMPANY_CITY_STATE_ZIP,
      companyPhone: GLOBAL_CONSTANTS.COMPANY_PHONE,
      companyEmail: GLOBAL_CONSTANTS.COMPANY_EMAIL,

      // Report info
      reportId: reportId,

      // Product info
      productDescription: 'Smart Meter Pressure Transducer',
      modelNumber: device.modelNumber || device.id,
      serialNumber: device.serialNumber || 'N/A',
      calDate: currentDate.toLocaleDateString(),
      calDueDate: dueDate.toLocaleDateString(),

      // Certification status
      certified: certificationResult.certified,

      // Certification data
      certificationData: certificationData,

      // Sweep value from constants
      sweepValue: KRAKEN_CONSTANTS.SWEEP_VALUE,
      tolerance: 1.5,
      calibratedTemp: 73,

      // Footer info
      testerName: testerName,
      testDate: currentDate.toLocaleDateString(),
    };
  }

  /**
   * Get the path to the logo file as base64 data URL
   * @returns {string} Logo file as base64 data URL
   */
  getLogoPath() {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const logoPath = path.join(__dirname, '../../assets/images/hm_logo.jpg');

      // Check if logo exists, if not return empty string
      if (!fsSync.existsSync(logoPath)) {
        console.warn('Logo file not found at:', logoPath);
        return '';
      }

      // Read logo as base64 and return as data URL (similar to old app)
      const logoBase64 = fsSync.readFileSync(logoPath, { encoding: 'base64' });
      return `data:image/png;base64,${logoBase64}`;
    } catch (error) {
      console.warn('Error loading logo:', error);
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
        reject(error);
      }
    });
  }
}

export { KrakenPDFService };
