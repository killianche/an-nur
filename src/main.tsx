import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initSentry } from './lib/sentry';
import { initAudioStore } from './lib/audioStore';

// Sentry init — no-op без VITE_SENTRY_DSN.  На прод DSN передаётся
// через .env.production.local (см. lib/sentry.ts header).
initSentry();

// Реестр скачанного аудио.  Стартуем до рендера, чтобы к первому
// нажатию play() путь к локальному файлу уже резолвился синхронно;
// промис не ждём — если реестр не успеет, плеер просто отработает
// первый аят со стрима.
void initAudioStore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
