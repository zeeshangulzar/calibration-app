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

  /**
   * Capture message with context
   */
  captureMessage(message, level = 'info', context = {}) {
    if (!this.isEnabled) {
      const module = context.module || 'APP';
      console.log(`[${module.toUpperCase()}] ${level.toUpperCase()}:`, message);
      return;
    }

    Sentry.captureMessage(message, {
      level,
      tags: {
        module: context.module || 'unknown',
        service: context.service || 'unknown',
        ...context.tags,
      },
      extra: {
        timestamp: new Date().toISOString(),
        ...context.extra,
      },
    });
  }

  /**
   * Add breadcrumb for operations
   */
  addBreadcrumb(message, category = 'general', level = 'info', data = {}) {
    if (!this.isEnabled) {
      console.log(`[APP] Breadcrumb:`, message);
      return;
    }

    Sentry.addBreadcrumb({
      message,
      category,
      level,
      data: {
        timestamp: new Date().toISOString(),
        ...data,
      },
    });
  }

  /**
   * Set user context
   */
  setUserContext(user) {
    if (!this.isEnabled) {
      return;
    }

    Sentry.setUser(user);
  }

  /**
   * Set extra context
   */
  setExtra(key, value) {
    if (!this.isEnabled) {
      return;
    }

    Sentry.setExtra(key, value);
  }

  /**
   * Set tag
   */
  setTag(key, value) {
    if (!this.isEnabled) {
      return;
    }

    Sentry.setTag(key, value);
  }
}

// Export singleton instance
export const sentryLogger = new SentryLogger();
