import { EventEmitter } from 'events';
import { getMainWindow } from '../windows/main.js';
import path from 'path';

/**
 * Navigation service to handle route changes within the main window
 * This decouples controllers from direct window management
 */
class NavigationService extends EventEmitter {
  constructor() {
    super();
    this.currentRoute = null;
    this.routeData = null;
  }

  /**
   * Navigate to a specific route
   * @param {string} route - Route name (e.g., 'kraken-list', 'calibration')
   * @param {object} data - Optional data to pass to the route
   */
  async navigateTo(route, data = null) {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      throw new Error('Main window not available');
    }

    const routeConfig = this.getRouteConfig(route);
    if (!routeConfig) {
      throw new Error(`Unknown route: ${route}`);
    }

    this.currentRoute = route;
    this.routeData = data;

    // Load the HTML file for the route
    await mainWindow.loadFile(routeConfig.htmlPath);

    // Wait for page to load, then send route data
    mainWindow.webContents.once('did-finish-load', () => {
      if (data) {
        mainWindow.webContents.send('route-data', data);
      }
      this.emit('navigation-complete', { route, data });
    });

    this.emit('navigation-started', { route, data });
  }

  /**
   * Get route configuration
   * @param {string} route - Route name
   * @returns {object} Route configuration
   */
  getRouteConfig(route) {
    const routes = {
      'home': {
        htmlPath: path.join('src', 'renderer', 'layout', 'index.html')
      },
      'kraken-list': {
        htmlPath: path.join('src', 'renderer', 'kraken-list', 'index.html')
      },
      'calibration': {
        htmlPath: path.join('src', 'renderer', 'kraken-calibration', 'index.html')
      }
    };

    return routes[route];
  }

  /**
   * Get current route information
   * @returns {object} Current route and data
   */
  getCurrentRoute() {
    return {
      route: this.currentRoute,
      data: this.routeData
    };
  }

  /**
   * Go back to previous route (simplified implementation)
   */
  async goBack() {
    // For now, just go to home - could be enhanced with route history
    await this.navigateTo('home');
  }
}

// Singleton instance
let navigationInstance = null;

export function getNavigationService() {
  if (!navigationInstance) {
    navigationInstance = new NavigationService();
  }
  return navigationInstance;
}

export { NavigationService };
