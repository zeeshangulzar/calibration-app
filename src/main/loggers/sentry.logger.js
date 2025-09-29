import * as Sentry from '@sentry/electron/main';
import { isSentryConfigured } from '../../config/sentry.config.js';
import { getLocationService } from '../../shared/helpers/location-helper.js';

/**
 * Generic Sentry Logger
 *
 * Simple, reusable logger for error tracking and monitoring
 */
class SentryLogger {
  constructor() {
    this.isEnabled = isSentryConfigured;
    this.locationService = getLocationService();
  }

  /**
   * Handle errors with consistent logging and Sentry reporting
   */
  async handleError(error, context = {}) {
    if (!this.isEnabled()) {
      const module = context.module || 'APP';
      console.error(`[${module.toUpperCase()}] Error:`, error);
      return;
    }

    try {
      // Get location information (city and country only)
      const location = await this.locationService.getLocation();

      Sentry.captureException(error, {
        tags: {
          module: context.module || 'APP',
          service: context.service || 'APP',
          method: context.method || 'APP',
          ...context.tags,
        },
        extra: {
          timestamp: new Date().toISOString(),
          location: {
            city: location.city,
            country: location.country,
            ip: location.ip,
          },
          ...context.extra,
        },
        level: context.level || 'error',
      });
    } catch (locationError) {
      // If location fails, still send error to Sentry without location
      console.warn('Failed to get location for Sentry:', locationError.message);

      Sentry.captureException(error, {
        tags: {
          module: context.module || 'APP',
          service: context.service || 'APP',
          method: context.method || 'APP',
          ...context.tags,
        },
        extra: {
          timestamp: new Date().toISOString(),
          location: {
            city: 'Unknown',
            country: 'Unknown',
            ip: 'Unknown',
          },
          ...context.extra,
        },
        level: context.level || 'error',
      });
    }
  }

  /**
   * Capture exception with context
   */
  captureException(error, context = {}) {
    this.handleError(error, context);
  }
}

// Export singleton instance
export const sentryLogger = new SentryLogger();
