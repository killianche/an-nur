import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor — нативная обёртка веб-приложения.
 *
 * Сборка:
 *   npm run sync            # build + cap sync (обновить обе платформы)
 *   npx cap open ios        # Xcode
 *   npx cap open android    # Android Studio
 *
 * webDir: 'dist' — Capacitor берёт ровно вывод vite build.
 */
const config: CapacitorConfig = {
  // ВНИМАНИЕ: appId после первой публикации в сторах не меняется.
  // Значение временное — подтвердить у владельца до первого релиза.
  appId: 'app.quranru',
  appName: 'Коран',
  webDir: 'dist',
  server: {
    // Без этого Android грузит WebView по http://, что блокирует
    // mixed-content и ломает MediaSession.
    androidScheme: 'https',
  },
  ios: {
    // contentInset='always' убирает прыжки под статус-баром при
    // pull-to-refresh и сам учитывает safe-area сверху.
    contentInset: 'always',
    // Цвет между скрытием сплэша и первым кадром вьюшки (100-200 мс на
    // iPhone 12).  Тёмно-индиго, чтобы не мигало белым на «Авроре» —
    // она стоит темой первого запуска.
    backgroundColor: '#0a0a14',
  },
  android: {
    backgroundColor: '#0a0a14',
  },
  plugins: {
    SplashScreen: {
      // launchAutoHide: false — сплэш убирает приложение само, из
      // App.tsx, когда дерево смонтировано.  Так пользователь не видит
      // пустой канвы между скрытием сплэша и первым кадром.
      //
      // ВАЖНО: в QuranIng здесь стоял тот же флаг, но вызова
      // SplashScreen.hide() в коде не было ВООБЩЕ — нативное
      // приложение зависало бы на сплэше навсегда.  В QuranRu вызов
      // есть, см. lib/nativeSplash.ts и App.tsx.
      launchShowDuration: 1000,
      launchAutoHide: false,
      backgroundColor: '#0a0a14',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // Тон статус-бара синхронится с темой в App.tsx через
      // StatusBar.setStyle().  Дефолт — под тёмную «Аврору».
      style: 'DARK',
      backgroundColor: '#0a0a14',
    },
  },
};

export default config;
