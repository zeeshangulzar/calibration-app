import * as Sentry from '@sentry/electron/main';
import { isSentryConfigured } from '../../config/sentry.config.js';

/**
 * Generic Sentry Logger
 *
 * Simple, reusable logger for error tracking and monitoring
 */
class SentryLogger {
  constructor() {
    this.isEnabled = isSentryConfigured();
  }

  /**
   * Handle errors with consistent logging and Sentry reporting
   */
  handleError(error, context = {}) {
    if (!this.isEnabled) {
      const module = context.module || 'APP';
      console.error(`[${module.toUpperCase()}] Error:`, error);
      return;
    }

    Sentry.captureException(error, {
      tags: {
        module: context.module || 'APP',
        service: context.service || 'APP',
        method: context.method || 'APP',
        ...context.tags,
      },
      extra: {
        timestamp: new Date().toISOString(),
        ...context.extra,
      },
      level: context.level || 'error',
    });
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
