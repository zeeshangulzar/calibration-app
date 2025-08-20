/**
 * Simple Sentry Configuration for App Crash Tracking
 */

import { app } from 'electron';

// Simple configuration for crash tracking only
export const getBaseSentryConfig = () => {
  const version = app?.getVersion() || '1.0.0';
  const environment = process.env.NODE_ENV || 'production';
  return {
    dsn: process.env.SENTRY_DSN,
    environment: environment,
    release: `sm-calibration@${version}`,

    // Only track crashes, not performance
    tracesSampleRate: 0,
    autoSessionTracking: false,

    // Simple error filtering - only allow real crashes
    beforeSend(event, hint) {
      // Skip common non-critical errors
      const skipPatterns = [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'Script error',
        'Network request failed',
      ];

      const errorMessage = event.exception?.values?.[0]?.value || '';
      if (skipPatterns.some(pattern => errorMessage.includes(pattern))) {
        return null;
      }

      return event;
    },
  };
};

// Main process configuration
export const getMainProcessConfig = () => getBaseSentryConfig();

// Preload process configuration
export const getPreloadProcessConfig = () => getBaseSentryConfig();

// Utility function to check if Sentry is configured
export const isSentryConfigured = () => {
  return process.env.SENTRY_DSN || '';
};
