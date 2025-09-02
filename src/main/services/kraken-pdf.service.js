import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';

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
   * @returns {Promise<Object>} Result object with success status and file path
   */
  async generateKrakenPDF(device, deviceData, certificationResult) {
    try {
      // Ensure output directory exists
      await this.ensureOutputDirectory(device.displayName || device.id);

      // Generate report content
      const reportContent = await this.generateReportContent(device, deviceData, certificationResult);

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
   * @returns {Promise<string>} HTML content string
   */
  async generateReportContent(device, deviceData, certificationResult) {
    try {
      // Try to load template, fallback to default if not found
      let template;
      try {
        const templateContent = await fs.readFile(this.templatePath, 'utf8');
        template = Handlebars.compile(templateContent);
      } catch {
        console.warn('Template file not found, using default template');
        template = this.getDefaultTemplate();
      }

      // Prepare data for template
      const templateData = this.prepareTemplateData(device, deviceData, certificationResult);

      // Generate HTML content
      return template(templateData);
    } catch (error) {
      console.error('Error generating report content:', error);
      // Fallback to simple HTML if template fails
      return this.generateSimpleHTML(device, deviceData, certificationResult);
    }
  }

  /**
   * Get default Handlebars template
   * @returns {Function} Compiled Handlebars template
   */
  getDefaultTemplate() {
    const templateString = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kraken Calibration Report - {{deviceName}}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .certification-status { padding: 15px; border-radius: 8px; margin: 20px 0; font-weight: bold; text-align: center; }
        .certified { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .failed { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .summary { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .data-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .data-table th, .data-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        .data-table th { background-color: #f2f2f2; font-weight: bold; }
        .discrepancy { font-weight: bold; }
        .discrepancy.good { color: #28a745; }
        .discrepancy.warning { color: #ffc107; }
        .discrepancy.bad { color: #dc3545; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Kraken Calibration Report</h1>
        <h2>{{deviceName}}</h2>
        <p>Generated on {{generationDate}}</p>
    </div>

    <div class="certification-status {{#if certified}}certified{{else}}failed{{/if}}">
        {{#if certified}}
            ✅ CERTIFICATION PASSED
        {{else}}
            ❌ CERTIFICATION FAILED
        {{/if}}
    </div>

    <div class="summary">
        <h3>Certification Summary</h3>
        <p><strong>Device ID:</strong> {{deviceId}}</p>
        <p><strong>Firmware Version:</strong> {{firmwareVersion}}</p>
        <p><strong>Average Discrepancy:</strong> {{averageDiscrepancy}} PSI</p>
        <p><strong>Total Readings:</strong> {{totalReadings}}</p>
        <p><strong>Certification Criteria:</strong> ≤ {{tolerance}} PSI</p>
        <p><strong>Result:</strong> {{certificationReason}}</p>
    </div>

    <h3>Verification Data</h3>
    <table class="data-table">
        <thead>
            <tr>
                <th>Reference Pressure (PSI)</th>
                <th>Kraken Reading (PSI)</th>
                <th>Discrepancy (PSI)</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            {{#each verificationData}}
            <tr>
                <td>{{flukePressure}}</td>
                <td>{{krakenPressure}}</td>
                <td class="discrepancy {{discrepancyClass}}">{{discrepancy}}</td>
                <td>{{discrepancyStatus}}</td>
            </tr>
            {{/each}}
        </tbody>
    </table>

    <div class="footer">
        <p>This report was automatically generated by the SmartMonster Calibration App</p>
        <p>Report ID: {{reportId}}</p>
    </div>
</body>
</html>`;

    return Handlebars.compile(templateString);
  }

  /**
   * Prepare data for template rendering
   * @param {Object} device - Device information
   * @param {Array} deviceData - Verification data array
   * @param {Object} certificationResult - Certification result object
   * @returns {Object} Template data object
   */
  prepareTemplateData(device, deviceData, certificationResult) {
    const tolerance = 1.5; // From kraken.constants

    // Process verification data for display
    const verificationData = deviceData.map(reading => {
      const discrepancy = Math.abs(reading.krakenPressure - reading.flukePressure);
      let discrepancyClass = 'good';
      let discrepancyStatus = 'Good';

      if (discrepancy > tolerance) {
        discrepancyClass = 'bad';
        discrepancyStatus = 'Failed';
      } else if (discrepancy > tolerance * 0.8) {
        discrepancyClass = 'warning';
        discrepancyStatus = 'Warning';
      }

      return {
        flukePressure: reading.flukePressure.toFixed(1),
        krakenPressure: reading.krakenPressure.toFixed(1),
        discrepancy: discrepancy.toFixed(1),
        discrepancyClass,
        discrepancyStatus,
      };
    });

    return {
      deviceName: device.displayName || device.id,
      deviceId: device.id,
      firmwareVersion: device.firmwareVersion || 'Unknown',
      certified: certificationResult.certified,
      averageDiscrepancy: certificationResult.averageDiscrepancy,
      totalReadings: certificationResult.totalReadings,
      tolerance: tolerance,
      certificationReason: certificationResult.reason,
      verificationData: verificationData,
      generationDate: new Date().toLocaleString(),
      reportId: `KRK-${device.id.substring(0, 8)}-${Date.now()}`,
    };
  }

  /**
   * Generate PDF from HTML content using Puppeteer
   * @param {string} htmlContent - HTML content to convert
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generatePDFFromHTML(htmlContent) {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
        printBackground: true,
      });

      await browser.close();
      return pdfBuffer;
    } catch (error) {
      console.error('Error generating PDF from HTML:', error);
      throw error;
    }
  }

  /**
   * Generate simple HTML as fallback
   * @param {Object} device - Device information
   * @param {Array} deviceData - Verification data array
   * @param {Object} certificationResult - Certification result object
   * @returns {string} Simple HTML string
   */
  generateSimpleHTML(device, deviceData, certificationResult) {
    const tolerance = 1.5;

    let html = `
<!DOCTYPE html>
<html>
<head>
    <title>Kraken Report - ${device.displayName || device.id}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .status { padding: 15px; margin: 20px 0; border-radius: 8px; font-weight: bold; text-align: center; }
        .passed { background-color: #d4edda; color: #155724; }
        .failed { background-color: #f8d7da; color: #721c24; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Kraken Calibration Report</h1>
        <h2>${device.displayName || device.id}</h2>
        <p>Generated on ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="status ${certificationResult.certified ? 'passed' : 'failed'}">
        ${certificationResult.certified ? '✅ CERTIFICATION PASSED' : '❌ CERTIFICATION FAILED'}
    </div>
    
    <h3>Summary</h3>
    <p><strong>Device ID:</strong> ${device.id}</p>
    <p><strong>Firmware:</strong> ${device.firmwareVersion || 'Unknown'}</p>
    <p><strong>Average Discrepancy:</strong> ${certificationResult.averageDiscrepancy} PSI</p>
    <p><strong>Total Readings:</strong> ${certificationResult.totalReadings}</p>
    <p><strong>Certification Criteria:</strong> ≤ ${tolerance} PSI</p>
    <p><strong>Result:</strong> ${certificationResult.reason}</p>
    
    <h3>Verification Data</h3>
    <table>
        <thead>
            <tr><th>Reference (PSI)</th><th>Kraken (PSI)</th><th>Discrepancy (PSI)</th></tr>
        </thead>
        <tbody>`;

    deviceData.forEach(reading => {
      const discrepancy = Math.abs(reading.krakenPressure - reading.flukePressure);
      const status = discrepancy <= tolerance ? '✅' : '❌';
      html += `
            <tr>
                <td>${reading.flukePressure.toFixed(1)}</td>
                <td>${reading.krakenPressure.toFixed(1)}</td>
                <td>${discrepancy.toFixed(1)} ${status}</td>
            </tr>`;
    });

    html += `
        </tbody>
    </table>
    
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666;">
        <p>Generated by SmartMonster Calibration App</p>
    </div>
</body>
</html>`;

    return html;
  }
}

export { KrakenPDFService };
