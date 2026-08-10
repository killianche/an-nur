/**
 * CosmicLayer — фон темы «Аврора».
 *
 * Один слой: <Aurora> в режиме рамки — мягкое свечение по краям
 * экрана и чистый центр.  Ничего не движется.
 *
 * Живое свечение (дыхание рамки + волна по периметру) было сделано и
 * снято по решению владельца: в читалке любое движение на периферии
 * через полчаса начинает мешать.  Код — в истории git.
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
 * яркость…).  Здесь не настраивается ничего: константы приезжают
 * из AURORA_SCENE.
 */

import { useEffect } from 'react';
import { Aurora } from './Aurora';
import { AURORA_ICE, AURORA_MOSS, AURORA_SCENE, AURORA2_SCENE } from '../lib/cosmic';

export function CosmicLayer({ variant = 'aurora' }: { variant?: 'aurora' | 'aurora2' }) {
  // Какая из двух космических тем сейчас: ледяная рамка по краям или
  // зелёное пятно из центра.  Всё различие сводится к палитре и сцене —
  // сам слой один и тот же.
  const second = variant === 'aurora2';
  const palette = second ? AURORA_MOSS : AURORA_ICE;
  const scene = second ? AURORA2_SCENE : AURORA_SCENE;

  // Проецируем палитру сияния на CSS-переменную караоке-подсветки,
  // чтобы активное слово загоралось тем же цветом, что и небо.
  // Правило в index.css падает на нейтральное свечение, когда
  // переменной нет (светлая и тёмная темы), так что «расстилизация»
  // происходит сама собой при размонтировании слоя.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--ayah-word-shadow',
      palette.wordShadow,
    );
    return () => {
      document.documentElement.style.removeProperty('--ayah-word-shadow');
    };
  }, [palette]);

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
        brightness={scene.auroraBrightness}
        direction={scene.auroraDirection}
        palette={palette}
      />
    </div>
  );
}
