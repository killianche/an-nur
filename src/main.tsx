import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initSentry } from './lib/sentry';
import { initAudioStore } from './lib/audioStore';
import { armAutoDownload } from './lib/audioAutoDownload';

// Sentry init — no-op без VITE_SENTRY_DSN.  На прод DSN передаётся
// через .env.production.local (см. lib/sentry.ts header).
initSentry();

// Реестр скачанного аудио.  Стартуем до рендера, чтобы к первому
// нажатию play() путь к локальному файлу уже резолвился синхронно;
// промис не ждём — если реестр не успеет, плеер просто отработает
// первый аят со стрима.
//
// Автозагрузка чтеца по умолчанию ставится на взвод ПОСЛЕ реестра:
// иначе она не увидит уже скачанное и полезла бы качать заново.
void initAudioStore().then(() => armAutoDownload());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
