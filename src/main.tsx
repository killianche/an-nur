import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initSentry } from './lib/sentry';

// Sentry init — no-op без VITE_SENTRY_DSN.  На прод DSN передаётся
// через .env.production.local (см. lib/sentry.ts header).
initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
