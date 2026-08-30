import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initSentry } from './lib/sentry';
import { initGlobalErrorHandlers } from './lib/globalErrors';
import { initAudioStore } from './lib/audioStore';
import { armAutoDownload } from './lib/audioAutoDownload';
import { Capacitor } from '@capacitor/core';
import { lockReaderOrientation } from './lib/screenOrientation';

// Отметка «мы внутри нативной обёртки» на <html>.
//
// Нужна, чтобы правила, придуманные для приложения, не портили жизнь
// веб-версии.  Первый такой случай — запрет «резинки» прокрутки:
// в приложении он обязателен (без него уезжает закреплённая шапка),
// а на сайте это лишнее ограничение поведения, которое человек ждёт
// от обычной страницы.
if (Capacitor.isNativePlatform()) {
  document.documentElement.setAttribute('data-native', '');
  // Физический поворот телефона сам по себе ничего не меняет. Горизонтальный
  // мусхаф включается отдельной кнопкой и при выходе возвращает портрет.
  void lockReaderOrientation('portrait');
}

// Sentry init — no-op без VITE_SENTRY_DSN.  На прод DSN передаётся
// через .env.production.local (см. lib/sentry.ts header).
initSentry();

// Перехват всего, что проходит мимо ErrorBoundary: ошибок в
// обработчиках событий и отвалившихся промисов.  Ставим ПЕРВЫМ, до
// любого нашего кода, чтобы поймать в том числе падение на старте.
initGlobalErrorHandlers();

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
