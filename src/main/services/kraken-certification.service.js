// import { addDelay } from '../../shared/helpers/calibration-helper.js';

import * as db from '../db/kraken-db.service.js';
import { generatePdf } from '../pdf/pdf.service.js';

class KrakenCertificationService {
  constructor(controller) {
    this.controller = controller;
    this.globalState = controller.globalState;
  }

  /**
   * Starts the certification process for all verified devices.
   */
  async startCertification(testerName) {
    this.showLogOnScreen('--- KRAKEN CERTIFICATION PROCESS ---');
    console.log(`Starting certification process for tester: ${testerName}`);

    const sweepData = this.globalState.getKrakenSweepData();
    if (!sweepData || Object.keys(sweepData).length === 0) {
      this.showLogOnScreen('❌ No verification data available to certify.');
      return;
    }

    const devices = this.globalState.getConnectedDevices();
    for (const device of devices) {
      const deviceSweepData = sweepData[device.id];
      if (!deviceSweepData) {
        this.showLogOnScreen(`⚠️ No sweep data found for ${device.name || device.id}. Skipping.`);
        continue;
      }

      this.showLogOnScreen(`Certifying device: ${device.name || device.id}`);
      const certificationData = this.calculateCertificationMetrics(device, deviceSweepData);

      const report = {
        kraken_id: device.id,
        kraken_name: device.name,
        serial_number: device.serialNumber || 'N/A', // Assuming serial is available
        tester_name: testerName,
        test_date: new Date().toISOString(),
        verification_data: deviceSweepData,
        certification_data: certificationData,
        calibration_status: 'certified',
      };

      const result = db.saveReport(report);
      if (result.success) {
        const reportId = result.id;
        this.showLogOnScreen(`✅ Report saved for ${device.name || device.id} with ID: ${reportId}`);
        const pdfResult = await generatePdf({ ...report, id: reportId }, 'kraken');
        if (pdfResult.success) {
          this.showLogOnScreen(`📄 PDF certificate created at: ${pdfResult.path}`);
        } else {
          this.showLogOnScreen(`❌ Failed to create PDF: ${pdfResult.error}`);
        }
      } else {
        this.showLogOnScreen(`❌ Failed to save report for ${device.name || device.id}: ${result.error}`);
      }
    }

    this.showLogOnScreen('✅ Certification process completed.');
  }

  calculateCertificationMetrics(device, sweepData) {
    const maxPressure = device.maxPressure || 1000; // Default max pressure
    const calculatedMetrics = sweepData.map(point => {
      const error = point.krakenPressure - point.flukePressure;
      const percentFS = (Math.abs(error) / maxPressure) * 100;
      return {
        ...point,
        error: error.toFixed(3),
        percentFS: percentFS.toFixed(3),
      };
    });

    const linearity = Math.max(...calculatedMetrics.map(p => parseFloat(p.percentFS)), 0);
    const hysteresis = this.calculateHysteresis(calculatedMetrics);

    return {
      points: calculatedMetrics,
      linearity: linearity.toFixed(3),
      hysteresis: hysteresis.toFixed(3),
    };
  }

  calculateHysteresis(points) {
    let maxHysteresis = 0;
    const pressureMap = new Map();
    points.forEach(p => {
      const key = p.flukePressure.toFixed(2);
      if (pressureMap.has(key)) {
        pressureMap.get(key).push(p.krakenPressure);
      } else {
        pressureMap.set(key, [p.krakenPressure]);
      }
    });

    for (const pressures of pressureMap.values()) {
      if (pressures.length > 1) {
        const diff = Math.abs(pressures[0] - pressures[1]);
        if (diff > maxHysteresis) {
          maxHysteresis = diff;
        }
      }
    }
    return maxHysteresis;
  }

  showLogOnScreen(log) {
    this.controller.showLogOnScreen(log);
  }
}

export { KrakenCertificationService };
