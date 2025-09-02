import { FlukeMockService } from './fluke-mock.service.js';

/**
 * Simple Factory Service for Fluke
 * Automatically chooses between mock and real services based on environment
 */
class FlukeFactoryService {
  constructor() {
    this.isDevelopment = this._isDevelopmentEnvironment();
    this._instance = null;

    console.log(`🔧 Fluke Factory initialized. Environment: ${this.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
  }

  /**
   * Gets the appropriate Fluke service instance
   * @param {Function} showLogOnScreen - Function to show logs on screen
   * @param {Function} isProcessActiveFn - Function to check if process is active
   * @returns {Object} Fluke service instance (mock in dev, real in production)
   */
  getFlukeService(showLogOnScreen, isProcessActiveFn) {
    if (this._instance) {
      return this._instance;
    }

    if (this.isDevelopment) {
      console.log('🔧 Creating Mock Fluke service for development');
      this._instance = new FlukeMockService();
    } else {
      console.log('🔧 Creating Real Fluke service for production');
      this._instance = this._createRealFlukeService(showLogOnScreen, isProcessActiveFn);
    }

    return this._instance;
  }

  /**
   * Determines if the current environment is development
   * @returns {boolean} True if development environment
   * @private
   */
  _isDevelopmentEnvironment() {
    // Check environment variables
    const nodeEnv = process.env.NODE_ENV;
    const isDev = process.env.ELECTRON_IS_DEV;

    // Check if app is packaged (process.defaultApp is false when packaged)
    const isPackaged = process.defaultApp === false;

    // Check command line arguments
    const hasDevFlag = process.argv.includes('--dev') || process.argv.includes('--development');

    // Log environment detection for debugging
    console.log('🔧 Environment detection:', {
      NODE_ENV: nodeEnv,
      ELECTRON_IS_DEV: isDev,
      isPackaged: isPackaged,
      hasDevFlag: hasDevFlag,
      processArgv: process.argv,
    });

    // Development if any of these conditions are met
    const isDevelopment =
      nodeEnv === 'development' ||
      nodeEnv === 'dev' ||
      isDev === 'true' ||
      isDev === true ||
      !isPackaged || // !isPackaged means development (not packaged)
      hasDevFlag;

    console.log(`🔧 Environment determined as: ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'}`);
    return isDevelopment;
  }

  /**
   * Creates the real Fluke service instance
   * @param {Function} showLogOnScreen - Function to show logs on screen
   * @param {Function} isProcessActiveFn - Function to check if process is active
   * @returns {Object} Real Fluke service instance
   * @private
   */
  _createRealFlukeService(showLogOnScreen, isProcessActiveFn) {
    try {
      // Dynamic import to avoid loading real Fluke service in development
      const { FlukeManager } = require('./fluke.manager.js');

      // Use provided functions or create defaults
      const logFunction = showLogOnScreen || (log => console.log(`[FlukeManager] ${log}`));
      const processActiveFunction = isProcessActiveFn || (() => true);

      return new FlukeManager(logFunction, processActiveFunction);
    } catch (error) {
      console.error('❌ Failed to create real Fluke service:', error);
      console.log('🔄 Falling back to Mock Fluke service');

      // Fallback to mock service if real service creation fails
      this._instance = new FlukeMockService();
      return this._instance;
    }
  }
}

export { FlukeFactoryService };
