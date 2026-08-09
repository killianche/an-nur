/**
 * CosmicLayer — фон темы «Аврора».
 *
 * Два слоя в одном full-screen `aria-hidden` контейнере:
 *   1. Звёзды — <CosmicWarp>, 3D-пролёт на canvas.
 *   2. Сияние — <Aurora>, один DOM-слой с медленным дрифтом.
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
 * яркость…) и слушала событие `cosmic-changed`, чтобы подхватывать
 * правки из панели настроек.  Здесь «Аврора» — одна тема с
 * фиксированным видом, поэтому ни состояния, ни подписок нет:
 * константы приезжают из AURORA_SCENE.
 */

import { useEffect } from 'react';
import { Aurora } from './Aurora';
import { CosmicWarp } from './CosmicWarp';
import { AURORA_ICE, AURORA_SCENE } from '../lib/cosmic';

export function CosmicLayer() {
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
      <CosmicWarp speed={AURORA_SCENE.starsSpeed} />
      <Aurora
        brightness={AURORA_SCENE.auroraBrightness}
        direction={AURORA_SCENE.auroraDirection}
      />
    </div>
  );
}
