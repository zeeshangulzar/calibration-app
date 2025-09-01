import path from 'path';
import fs from 'fs';
import Handlebars from 'handlebars';
import { app, BrowserWindow } from 'electron';

const baseTemplatePath = path.join(app.getAppPath(), 'src', 'main', 'pdf');

Handlebars.registerHelper('formatDate', dateString => {
  if (!dateString) return 'N/A';
  const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Date(dateString).toLocaleDateString(undefined, options);
});

async function generatePdf(reportData, deviceType) {
  const templatePath = path.join(baseTemplatePath, deviceType, 'certificate_template.html');
  let templateHtml;
  try {
    templateHtml = fs.readFileSync(templatePath, 'utf8');
  } catch (error) {
    return { success: false, error: `Template for ${deviceType} not found.` };
  }

  try {
    const template = Handlebars.compile(templateHtml);
    const htmlContent = template(reportData);

    const tempWindow = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false } });
    await tempWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    const pdfData = await tempWindow.webContents.printToPDF({
      marginsType: 0,
      pageSize: 'A4',
      printBackground: true,
      landscape: false,
    });
    tempWindow.close();

    const desktopPath = app.getPath('desktop');
    const fileName = `${deviceType}_Certificate_${reportData.serial_number || reportData.kraken_id}_${reportData.id}.pdf`;
    const outputPath = path.join(desktopPath, fileName);

    fs.writeFileSync(outputPath, pdfData);
    return { success: true, path: outputPath };
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    return { success: false, error: error.message };
  }
}

export { generatePdf };
