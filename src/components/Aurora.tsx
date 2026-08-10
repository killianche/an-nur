/**
 * Aurora — полярное сияние: свечение сверху экрана либо мягкая живая
 * рамка по краям (direction: 'frame' — то, что использует QuranRu).
 *
 * Один DOM-слой свечения, ноль JS/RAF, GPU-only анимация. Имитирует
 * настоящее полярное сияние: мягкий цветной свет в верхней части
 * кадра, плавно тающий к низу. Свечение медленно дрейфует по
 * горизонтали — как будто мы летим сквозь него, и пятна аврор
 * проплывают мимо, как далёкие звёзды CosmicWarp.
 *
 * Реализация (полный режим):
 *  - Внешний div: fixed full-screen, opacity = brightness, hidden overflow.
 *  - Внутренний div: width 200%, шесть радиальных эллипсов у верхнего
 *    края (на 11/29/43% и 61/79/93% — два одинаковых сета) + общий
 *    вертикальный фейд сверху вниз. Composite background, ОДИН DOM-узел.
 *    Размеры эллипсов в `vw/vh`, чтобы при 200% ширине внутреннего div
 *    пятна не раздувались — каждое примерно 55vw × 90vh.
 *  - Анимация: `transform: translateX(0 → -50%)`, 90s linear infinite.
 *    Seamless loop: после смещения на −50% правый сет пятен оказывается
 *    в исходных позициях левого сета (22/58/86% viewport), шва нет.
 *  - Обычное alpha-наложение, БЕЗ `mix-blend-mode`. Раньше использовался
 *    `screen` для аддитивного эффекта на чёрном фоне (звёзды просвечивали
 *    через ядра авроры). Убран ради скролла: `mix-blend-mode` на
 *    `position: fixed` заставлял браузер пересчитывать blend на каждом
 *    scroll-кадре, прокрутка лагала. Визуальная потеря: в зонах ярких
 *    ядер авроры (alpha до 0.55) звёзды приглушаются; пятна мягкие,
 *    эффект едва заметен.
 *  - `transform` + `will-change: transform` идут в compositor → 0 мс
 *    main-thread на быстрых устройствах.
 *
 * Reduced-motion / слабая сеть (см. shouldReduceAurora):
 *  - `prefers-reduced-motion: reduce` ИЛИ `navigator.connection.saveData`
 *    ИЛИ `effectiveType: 2g/slow-2g` → упрощённая статичная версия:
 *      • без `transform: translateX` анимации;
 *      • без `will-change: transform` (экономим compositor-слой и VRAM);
 *      • ширина 100% вместо 200% (вдвое меньше текстура в GPU);
 *      • 3 пятна вместо 6.
 *  - Это та же проверка, что у CosmicWarp — единая политика
 *    «слабый девайс / экономия трафика → статика, без анимаций».
 *  - В полном режиме слой и так уже без `mix-blend-mode`, но в
 *    упрощённом дополнительно отключаем 200% ширину и 6 пятен,
 *    чтобы текстура в GPU была вдвое легче.
 *
 * Почему именно horizontal drift, а не radial-warp как у звёзд:
 *  - Звёзды летят НА камеру (z уменьшается), их видимая позиция
 *    радиально расходится от точки схождения.
 *  - Аврор «висит над нами» в небе. При полёте вперёд он не
 *    приближается, а проплывает мимо. Естественное движение —
 *    горизонтальный дрифт (как ветер шевелит занавес сияния),
 *    а не радиальная вытяжка.
 *
 * История решений:
 *  - V1: 2 анимированных слоя `radial-gradient`, облетающих viewport
 *    по 4 углам. Дёргалось, не давало ощущения сияния.
 *  - V2: статические warp-стримеры через `repeating-conic-gradient`,
 *    радиально из центра. Перекликалось со звёздами, но выглядело
 *    как «солнечные лучи», не как полярное сияние.
 *  - V3: статика, свечение сверху из 3 радиальных пятен.
 *  - V4: добавлен медленный горизонтальный дрифт.
 *  - V5: добавлен fallback на reduced-motion / saveData / 2g —
 *    статичный упрощённый рендер для слабых устройств и медленных сетей.
 *  - V6 (сейчас): убран `mix-blend-mode: screen`. Скролл страницы вызывал
 *    repaint blend'а на каждом кадре (даже с обёрткой `isolation: isolate`
 *    в App.tsx это не во всех браузерах кэшировалось). Сейчас обычное
 *    alpha-наложение — нулевая стоимость на скролл.
 *  - `speed` в Props оставлен deprecated — App.tsx всё ещё его
 *    передаёт, ползунок есть в профиле. Чтобы не ломать вызов
 *    и не править весь pipeline, проп просто игнорируется.
 *
 * Параметры:
 *  - Яркость (opacity контейнера)
 *  - Направление ('top' / 'bottom' / 'frame')
 *  Палитра больше не выбирается — в QuranRu «Аврора» это одна тема с
 *  фиксированным ледяным свечением (AURORA_ICE в lib/cosmic.ts), а не
 *  конструктор из шести палитр, как было в QuranIng.
 */

import { memo, useEffect, useState } from 'react';
import { AURORA_ICE, type AuroraDirection } from '../lib/cosmic';

type Props = {
  brightness?: number;         // 0.1 – 1.0
  speed?: number;              // deprecated — дрифт фиксирован, не используется
  direction?: AuroraDirection; // 'top' (по умолч.) | 'bottom' | 'frame'
  /** Полный цикл дыхания рамки, секунды.  0 — рамка не дышит. */
  pulseSeconds?: number;
  /** Полный обход свечения вокруг экрана, секунды.  0 — не течёт. */
  flowSeconds?: number;
};

/**
 * Шесть точек на периметре, по которым идёт волна.  Каждая дуга — свой
 * небольшой слой, а не кусок общего полноэкранного фона: анимированный
 * элемент браузер уводит в отдельную текстуру, и шесть маленьких
 * текстур дешевле по видеопамяти, чем шесть полноэкранных.
 *
 * x/y — точка на краю в процентах вьюпорта, w/h — размер пятна.  Бокс
 * центрируется на этой точке, поэтому половина пятна уходит за экран:
 * ядро светится ровно на кромке, а внутрь идёт только мягкий спад.
 *
 * Порядок обхода — по часовой стрелке от верха: волна уходит вниз по
 * правому краю, проходит низ и поднимается по левому.
 */
const ARCS = [
  { x: 26,  y: 0,   w: 68, h: 40, accent: false },
  { x: 74,  y: 0,   w: 62, h: 36, accent: true  },
  { x: 100, y: 42,  w: 44, h: 64, accent: false },
  { x: 70,  y: 100, w: 66, h: 38, accent: true  },
  { x: 28,  y: 100, w: 64, h: 40, accent: false },
  { x: 0,   y: 60,  w: 42, h: 60, accent: true  },
] as const;

/**
 * Два больших мягких пятна у боковых кромок — то самое «перетекание
 * сверху вниз».  Периоды заданы долями от цикла течения и подобраны
 * так, чтобы не делиться нацело друг на друга: 0.44 и 0.61 совпадут
 * снова только через сотни оборотов, и глаз не поймает повтор.
 */
const SINKS = [
  { x: 8,  w: 62, h: 66, accent: true,  factor: 0.44 },
  { x: 92, w: 58, h: 62, accent: false, factor: 0.61 },
] as const;

// Заменяет alpha в строке rgba(r,g,b,a) на новое значение.
// Палитра в unlocks.ts хранит готовые rgba-строки без color-mix(),
// потому что color-mix() ломается на iOS Safari < 16.4.
function withAlpha(rgba: string, alpha: number): string {
  return rgba.replace(/[\d.]+\)$/, `${alpha})`);
}

// Должна ли аврора рендериться в упрощённом статичном виде?
// Та же логика, что в CosmicWarp.tsx → prefersReducedMotion():
// либо пользовательская настройка ОС, либо медленная сеть / saveData
// (сигнал «бюджетное устройство / экономия трафика»).
function shouldReduceAurora(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (navigator as any).connection as
    | { saveData?: boolean; effectiveType?: string }
    | undefined;
  return !!(c?.saveData || c?.effectiveType === '2g' || c?.effectiveType === 'slow-2g');
}

// Стили внешнего контейнера авроры. Применяются во всех 3 режимах.
//
// Контейнер уже сидит внутри изолированной космической группы App.tsx
// (там `isolation: isolate` + `contain: paint` + `translateZ(0)`), но
// дополнительно изолируем САМ слой авроры:
//   • contain: 'layout paint style' — браузер знает, что layout/paint/
//     style внутри слоя независимы от страницы. Не трогаем `size`,
//     потому что размер задан `inset: 0` (требует доступа к размеру
//     родителя). Изменение содержимого страницы (новые карточки,
//     раскрытие аккордеонов) не повлечёт repaint авроры.
//   • transform: translateZ(0) — форсирует отдельный compositor-слой
//     даже без `will-change`. Текстура слоя растеризуется один раз
//     и хранится в VRAM; скролл / свайп просто двигают viewport
//     поверх неё без обращения к main-thread.
//   • backfaceVisibility: 'hidden' — старый трюк для iOS Safari
//     гарантирует промоцию слоя на устройствах, которые игнорируют
//     `translateZ(0)` (старые WebKit на iOS 12-13 ещё встречаются).
const AURORA_CONTAINER_STYLE_BASE = {
  contain: 'layout paint style',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
} as const;

// Стили внутреннего div'а с тяжёлым background (6-10 radial-gradient).
// Тоже промоцируем в свой слой: при любом ре-рендере родителя
// (например, изменение brightness — opacity на внешнем контейнере)
// растеризованная текстура градиентов остаётся закэшированной,
// браузер не пересчитывает gradient.
const AURORA_INNER_STYLE_BASE = {
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
} as const;

function AuroraImpl({
  brightness = 0.45,
  direction = 'top',
  pulseSeconds = 0,
  flowSeconds = 0,
}: Props) {
  const colors = AURORA_ICE;

  // SSR-безопасно: на сервере — без редукции, на клиенте — детектируем
  // после монтирования (matchMedia/navigator недоступны во время SSR).
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(shouldReduceAurora());
  }, []);

  // Тона свечения: ядро (layer1) — самые яркие пятна сверху,
  // accent (layer2) — второе цветовое пятно для лёгкого
  // оттеночного перелива, halo (layer1 совсем слабый) — общий
  // фон-ореол сверху, склеивающий пятна.
  const core = withAlpha(colors.layer1, 0.55);
  const accent = withAlpha(colors.layer2, 0.45);
  const halo = withAlpha(colors.layer1, 0.18);
  const drop1 = withAlpha(colors.layer1, 0.18);
  const drop2 = withAlpha(colors.layer2, 0.14);
  const drop3 = withAlpha(colors.layer1, 0.16);
  const haloFade = withAlpha(colors.layer1, 0.06);

  // Один эллипс пятна сверху. x — позиция в % внутри слоя.
  // Размер 55vw × 90vh держит пятно одинаковым относительно viewport
  // независимо от ширины контейнера. Высота 90vh (было 75vh, +20% по
  // запросу) — свечение тянется ниже половины экрана, мягко размываясь
  // (центр у верхнего/нижнего края, видимая часть ≈ нижняя/верхняя
  // половина эллипса).
  const edgeY = direction === 'bottom' ? '100%' : '0%';
  const patch = (x: number, color: string, f: string) =>
    `radial-gradient(ellipse 55vw 90vh at ${x}% ${edgeY},
      ${color} 0%,
      ${f} 30%,
      transparent 75%)`;

  const fadeDir = direction === 'bottom' ? 'to top' : 'to bottom';
  const fade = `linear-gradient(${fadeDir},
    ${halo} 0%,
    ${haloFade} 35%,
    transparent 75%)`;

  // Frame-режим: «запотевшее стекло» — тонкая дымка прямо у самых
  // краёв экрана, быстро тает к центру. Никаких больших ядер в углах:
  // эффект как конденсат, скопившийся у рамки окна — мягкий, узкий
  // ободок цвета вдоль всех 4 краёв.
  //
  // Композиция:
  //  - 4 линейных градиента от каждого края (top/bottom/left/right),
  //    максимум насыщенности у самой кромки (color 0%),
  //    быстрое затухание (~14-20% от viewport) → transparent;
  //  - 4 малых радиальных «пятнышка» по серединам краёв для лёгкой
  //    органической неравномерности (фог не идеально ровный);
  //  - поверх ободка — «жизнь»: медленное дыхание всей рамки и волна,
  //    обходящая экран по кругу (ARCS), плюс два пятна, протекающих
  //    сверху вниз у боковых кромок (SINKS).  Ободок при этом остаётся
  //    самостоятельным: выключи движение — вид вернётся к прежнему
  //    статичному конденсату, а не к пустому экрану.
  if (direction === 'frame') {
    // Для дымки берём более слабый alpha чем core — конденсат светится
    // мягко, не светит как лампа.
    const mistStrong = withAlpha(colors.layer1, 0.32);
    const mistMid = withAlpha(colors.layer1, 0.16);
    const mistAccent = withAlpha(colors.layer2, 0.20);

    // 4 ободка по краям. Узкие — ~18% viewport — чтобы остался большой
    // прозрачный центр. Кривая stop'ов: сильное у кромки, плавный спад.
    const topMist = `linear-gradient(to bottom,
      ${mistStrong} 0%,
      ${mistMid} 6%,
      ${withAlpha(colors.layer1, 0.04)} 14%,
      transparent 22%)`;
    const bottomMist = `linear-gradient(to top,
      ${mistStrong} 0%,
      ${mistMid} 6%,
      ${withAlpha(colors.layer1, 0.04)} 14%,
      transparent 22%)`;
    const leftMist = `linear-gradient(to right,
      ${mistAccent} 0%,
      ${withAlpha(colors.layer2, 0.10)} 6%,
      ${withAlpha(colors.layer2, 0.03)} 14%,
      transparent 22%)`;
    const rightMist = `linear-gradient(to left,
      ${mistAccent} 0%,
      ${withAlpha(colors.layer2, 0.10)} 6%,
      ${withAlpha(colors.layer2, 0.03)} 14%,
      transparent 22%)`;

    // Лёгкая органическая патчёвость: маленькие радиалы на серединах
    // краёв. Очень мягкие, дают ощущение «конденсат лёг неравномерно».
    const patchEdge = (x: string, y: string, w: string, h: string, color: string) =>
      `radial-gradient(ellipse ${w} ${h} at ${x} ${y},
        ${color} 0%,
        transparent 70%)`;

    // Тона движущейся волны.  Ярче дымки, но ненамного: волна должна
    // читаться как «в этом месте сияние сейчас сильнее», а не как
    // отдельный источник света, ползущий по экрану.
    const waveCore = withAlpha(colors.layer1, 0.30);
    const waveCoreMid = withAlpha(colors.layer1, 0.12);
    const waveAccent = withAlpha(colors.layer2, 0.26);
    const waveAccentMid = withAlpha(colors.layer2, 0.10);

    const blob = (accent: boolean) =>
      `radial-gradient(ellipse 50% 50% at 50% 50%,
        ${accent ? waveAccent : waveCore} 0%,
        ${accent ? waveAccentMid : waveCoreMid} 34%,
        transparent 72%)`;

    // Анимации включаются только если движение вообще разрешено и
    // пользователь не поставил «Выкл».
    const alive = !reduced;
    const breathing = alive && pulseSeconds > 0;
    const flowing = alive && flowSeconds > 0;

    return (
      <div
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
        style={{ opacity: brightness, ...AURORA_CONTAINER_STYLE_BASE }}
      >
        {/* Ободок.  Он и есть рамка: волна только подсвечивает то, что
            уже нарисовано, поэтому свечение никогда не пропадает
            целиком, даже когда движение выключено. */}
        <div
          className="aurora-rim"
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              ${patchEdge('35%', '0%', '40vw', '12vh', mistMid)},
              ${patchEdge('70%', '0%', '35vw', '10vh', mistAccent)},
              ${patchEdge('30%', '100%', '38vw', '12vh', mistAccent)},
              ${patchEdge('72%', '100%', '40vw', '10vh', mistMid)},
              ${patchEdge('0%', '40%', '10vw', '35vh', mistMid)},
              ${patchEdge('100%', '65%', '10vw', '35vh', mistAccent)},
              ${topMist},
              ${bottomMist},
              ${leftMist},
              ${rightMist}
            `,
            animation: breathing
              ? `auroraBreath ${pulseSeconds}s ease-in-out infinite`
              : undefined,
            ...AURORA_INNER_STYLE_BASE,
          }}
        />

        {/* Волна: шесть дуг с одним кадром и разными фазами.
            Отрицательная задержка сдвигает дугу вперёд по циклу — к
            моменту первого кадра каждая уже стоит на своём месте, без
            «разгона» в начале. */}
        {flowing && ARCS.map((a, i) => (
          <div
            key={`arc-${i}`}
            className="aurora-arc"
            style={{
              position: 'absolute',
              left: `${a.x - a.w / 2}%`,
              top: `${a.y - a.h / 2}%`,
              width: `${a.w}%`,
              height: `${a.h}%`,
              background: blob(a.accent),
              opacity: 0,
              animation: `auroraWave ${flowSeconds}s linear infinite`,
              animationDelay: `${-(i / ARCS.length) * flowSeconds}s`,
              willChange: 'opacity, transform',
              backfaceVisibility: 'hidden',
            }}
          />
        ))}

        {/* Протекание сверху вниз у боковых кромок. */}
        {flowing && SINKS.map((b, i) => (
          <div
            key={`sink-${i}`}
            className="aurora-sink"
            style={{
              position: 'absolute',
              left: `${b.x - b.w / 2}%`,
              top: `${50 - b.h / 2}%`,
              width: `${b.w}%`,
              height: `${b.h}%`,
              background: blob(b.accent),
              opacity: 0,
              animation: `auroraSink ${Math.round(flowSeconds * b.factor)}s ease-in-out infinite`,
              animationDelay: `${-i * 7}s`,
              willChange: 'opacity, transform',
              backfaceVisibility: 'hidden',
            }}
          />
        ))}
      </div>
    );
  }

  // Упрощённый режим: 3 пятна, ширина 100%, без анимации, без will-change.
  // Тот же визуальный концепт «свечение сверху», но в 2 раза меньше
  // текстура в GPU и нулевая стоимость на кадр.
  if (reduced) {
    return (
      <div
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
        style={{ opacity: brightness, ...AURORA_CONTAINER_STYLE_BASE }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              ${patch(22, core, drop1)},
              ${patch(58, accent, drop2)},
              ${patch(86, core, drop3)},
              ${fade}
            `,
            ...AURORA_INNER_STYLE_BASE,
          }}
        />
      </div>
    );
  }

  // Полный режим: дрифт-анимация, 6 пятен, бесшовный цикл.
  // @keyframes auroraDrift живут в index.css — раньше был inline <style>,
  // который React пересоздавал при каждом ре-рендере (даже с memo это
  // случается при изменении brightness/palette/direction).
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      style={{ opacity: brightness, ...AURORA_CONTAINER_STYLE_BASE }}
    >
      <div
        className="aurora-drift"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '200%',
          height: '100%',
          background: `
            ${patch(11, core, drop1)},
            ${patch(29, accent, drop2)},
            ${patch(43, core, drop3)},
            ${patch(61, core, drop1)},
            ${patch(79, accent, drop2)},
            ${patch(93, core, drop3)},
            ${fade}
          `,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          animation: 'auroraDrift 90s linear infinite',
        }}
      />
    </div>
  );
}

// React.memo критически важен. App.tsx слушает 'asr-cosmic-changed' /
// 'storage' и при ЛЮБОМ событии обновляет все 8 стейтов сразу (звёзды +
// аврора), что без memo вызывает ре-рендер Aurora при каждом изменении
// ЗВЁЗДНЫХ настроек. Каждый ре-рендер пересоздаёт огромную background-
// строку (200vw × 100vh, 6 radial-gradient) → React видит новый inline
// style → DOM обновляет атрибут → браузер ре-растеризует compositor-слой.
// Для слабых девайсов это самый дорогой кадр, который можно совершенно
// бесплатно избежать: brightness/palette меняются редко, а props у
// Aurora ровно эти два + speed (deprecated). memo с дефолтным shallow-
// сравнением идеально подходит.
export const Aurora = memo(AuroraImpl);
