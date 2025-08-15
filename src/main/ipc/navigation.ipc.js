import { ipcMain } from 'electron';
import { getNavigationService } from '../services/navigation.service.js';

/**
 * Register navigation-related IPC handlers
 */
export function registerNavigationIpcHandlers() {
  const navigationService = getNavigationService();

  // Navigate to a specific route
  ipcMain.handle('navigate-to', async (event, route, data = null) => {
    try {
      await navigationService.navigateTo(route, data);
      return { success: true };
    } catch (error) {
      console.error('Navigation error:', error);
      return { success: false, error: error.message };
    }
  });

  // Go back to previous route
  ipcMain.handle('navigate-back', async () => {
    try {
      await navigationService.goBack();
      return { success: true };
    } catch (error) {
      console.error('Navigation back error:', error);
      return { success: false, error: error.message };
    }
  });

  // Get current route information
  ipcMain.handle('get-current-route', () => {
    return navigationService.getCurrentRoute();
  });

  // Legacy handlers for backward compatibility
  ipcMain.on('load-home-screen', () => {
    navigationService.navigateTo('home');
  });

  ipcMain.on('load-kraken-list', () => {
    navigationService.navigateTo('kraken-list');
  });

  ipcMain.on('load-kraken-calibration', (event, connectedDeviceIds) => {
    navigationService.navigateTo('calibration', { connectedDeviceIds });
  });
}
