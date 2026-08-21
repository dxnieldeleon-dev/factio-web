// Must be imported before anything else in the client entry so Sentry can
// instrument subsequent imports (fetch, router navigation, etc).
import * as Sentry from "@sentry/tanstackstart-react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (typeof document !== "undefined" && dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });
}
