import { FlukeMockService } from './fluke-mock.service.js';
import { FlukeManager } from './fluke.manager.js';
import { getFlukeSettings } from '../db/index.js';
import * as Sentry from '@sentry/electron/main';

/**
 * Simple Factory Service for Fluke
 * Automatically chooses between mock and real services based on user setting
 * Singleton pattern to ensure consistent settings across the app
 */
class FlukeFactoryService {
  constructor() {
    this.instance = null;
    this.mockFlukeEnabled = this.getMockFlukeSetting();

    console.log(`🔧 Fluke Factory initialized. Mock Fluke: ${this.mockFlukeEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Get singleton instance of FlukeFactoryService
   * @returns {FlukeFactoryService} Singleton instance
   */
  static getInstance() {
    if (!FlukeFactoryService._instance) {
      FlukeFactoryService._instance = new FlukeFactoryService();
    }
    return FlukeFactoryService._instance;
  }

  /**
   * Reload settings from database
   * Call this when settings are updated
   */
  reloadSettings() {
    this.mockFlukeEnabled = this.getMockFlukeSetting();
    console.log(`🔧 Fluke Factory settings reloaded. Mock Fluke: ${this.mockFlukeEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    // Clear existing instance to force recreation with new settings
    this.instance = null;
  }

  /**
   * Gets the appropriate Fluke service instance
   * @param {Function} showLogOnScreen - Function to show logs on screen
   * @param {Function} isProcessActiveFn - Function to check if process is active
   * @returns {Object} Fluke service instance (mock if enabled, real otherwise)
   */
  getFlukeService(showLogOnScreen, isProcessActiveFn) {
    if (this.instance) {
      return this.instance;
    }

    // Check current setting (in case it changed)
    this.mockFlukeEnabled = this.getMockFlukeSetting();

    if (this.mockFlukeEnabled) {
      console.log('🔧 Creating Mock Fluke service (user setting enabled)');
      this.instance = new FlukeMockService();
    } else {
      console.log('🔧 Creating Real Fluke service (user setting disabled)');
      this.instance = this.createRealFlukeService(showLogOnScreen, isProcessActiveFn);
    }

    return this.instance;
  }

  /**
   * Gets the mock Fluke setting from database
   * @returns {boolean} True if mock Fluke is enabled
   */
  getMockFlukeSetting() {
    try {
      const settings = getFlukeSettings();
      const mockEnabled = settings.mock_fluke_enabled === 1;

      console.log('🔧 Mock Fluke setting from database:', {
        mock_fluke_enabled: settings.mock_fluke_enabled,
        resolved: mockEnabled,
      });

      return mockEnabled;
    } catch (error) {
      Sentry.captureException(error);
      console.warn('🔧 Failed to read mock Fluke setting from database, defaulting to false:', error);
      return false;
    }
  }

  /**
   * Creates the real Fluke service instance
   * @param {Function} showLogOnScreen - Function to show logs on screen
   * @param {Function} isProcessActiveFn - Function to check if process is active
   * @returns {Object} Real Fluke service instance
   */
  createRealFlukeService(showLogOnScreen, isProcessActiveFn) {
    try {
      // Use provided functions or create defaults
      const logFunction = showLogOnScreen || (log => console.log(`[FlukeManager] ${log}`));
      const processActiveFunction = isProcessActiveFn || (() => true);

      return new FlukeManager(logFunction, processActiveFunction);
    } catch (error) {
      Sentry.captureException(error);
      console.error('❌ Failed to create real Fluke service:', error);
      console.log('🔄 Falling back to Mock Fluke service');

      // Fallback to mock service if real service creation fails
      this.instance = new FlukeMockService();
      return this.instance;
    }
  }
}

// Export singleton getter function
export const getFlukeFactory = () => FlukeFactoryService.getInstance();

export { FlukeFactoryService };
