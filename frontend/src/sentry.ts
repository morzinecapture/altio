import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: process.env.EXPO_PUBLIC_APP_ENV || 'development',
    // Traces 20% of transactions in prod (adjust as needed)
    tracesSampleRate: process.env.EXPO_PUBLIC_APP_ENV === 'production' ? 0.2 : 1.0,
    // Enable automatic session tracking
    enableAutoSessionTracking: true,
    // Capture uncaught JS errors
    enableNativeNagger: false,
    // Attach breadcrumbs for navigation
    integrations: [
      Sentry.reactNativeTracingIntegration(),
    ],
  });
}

/**
 * Capture an error explicitly (e.g. in catch blocks for critical operations).
 * Falls back to console.error if Sentry is not initialized.
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!DSN) return;
  if (context) {
    Sentry.withScope(scope => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export { Sentry };
