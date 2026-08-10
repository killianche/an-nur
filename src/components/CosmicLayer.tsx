/**
 * CosmicLayer — фон темы «Аврора».
 *
 * Один слой: <Aurora> в режиме рамки — мягкое свечение по краям
 * экрана и чистый центр.  Рамка медленно дышит, и по ней волной
 * обходит светлая зона: сверху вниз по одному краю и обратно вверх
 * по другому.  Движение намеренно на грани заметности — читают тут
 * подолгу, и всё, что глаз ловит как «шевелится», через полчаса
 * начинает мешать.
 *
 * Звёздное поле (<CosmicWarp>, 3D-пролёт на canvas) было убрано:
 * в кадре постоянно шло движение, а тут подолгу читают длинные
 * тексты, и мельтешение на периферии зрения мешает.  Заодно ушёл
 * canvas с rAF-циклом — минус постоянная нагрузка на слабых
 * телефонах и минус расход батареи при чтении.
 *
 * `isolation: isolate` + `contain: paint` держат дерево композитинга
 * внутри этого слоя — без них iOS Safari перекомпоновывает страницу на
 * каждом тике скролла и текст выше начинает дёргаться.
 *
 * Рендерится только когда активна тема «Аврора» — гейт стоит выше, в
 * App.tsx (`themeMode(theme) === 'cosmic'`).  На светлой и тёмной
 * компонент просто не монтируется: ни fade, ни затрат на DOM.
 *
 * Отличие от QuranIng: там сцена собиралась из восьми localStorage-
 * префов (режим звёзд, скорость, плотность, палитра, направление,
 * яркость…).  Здесь настраиваются только две вещи — скорость дыхания
 * и скорость течения рамки (lib/auroraPrefs.ts); остальное зашито
 * в AURORA_SCENE.
 */

import { useEffect, useState } from 'react';
import { Aurora } from './Aurora';
import { AURORA_ICE, AURORA_SCENE } from '../lib/cosmic';
import {
  getAuroraPulse, getAuroraFlow, onAuroraPrefsChange,
  PULSE_SECONDS, FLOW_SECONDS,
} from '../lib/auroraPrefs';

export function CosmicLayer() {
  // Скорость дыхания и течения рамки.  Читаем при монтировании и
  // пересчитываем по событию из попапа оформления — иначе смена
  // настройки была бы видна только после перезапуска.
  const [speeds, setSpeeds] = useState(() => ({
    pulse: PULSE_SECONDS[getAuroraPulse()],
    flow: FLOW_SECONDS[getAuroraFlow()],
  }));
  useEffect(() => onAuroraPrefsChange(() => setSpeeds({
    pulse: PULSE_SECONDS[getAuroraPulse()],
    flow: FLOW_SECONDS[getAuroraFlow()],
  })), []);

  // Проецируем палитру сияния на CSS-переменную караоке-подсветки,
  // чтобы активное слово загоралось тем же цветом, что и небо.
  // Правило в index.css падает на нейтральное свечение, когда
  // переменной нет (светлая и тёмная темы), так что «расстилизация»
  // происходит сама собой при размонтировании слоя.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--ayah-word-shadow',
      AURORA_ICE.wordShadow,
    );
    return () => {
      document.documentElement.style.removeProperty('--ayah-word-shadow');
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        isolation: 'isolate',
        contain: 'paint',
        transform: 'translateZ(0)',
        willChange: 'transform',
        background: '#000',
      }}
    >
      <Aurora
        brightness={AURORA_SCENE.auroraBrightness}
        direction={AURORA_SCENE.auroraDirection}
        pulseSeconds={speeds.pulse}
        flowSeconds={speeds.flow}
      />
    </div>
  );
}
