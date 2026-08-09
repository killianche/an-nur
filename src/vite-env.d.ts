/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN — set in .env.production.local (см. lib/sentry.ts). */
  readonly VITE_SENTRY_DSN?: string;
  /** Release tag для Sentry (опц., можно прокинуть через CI). */
  readonly VITE_RELEASE_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
