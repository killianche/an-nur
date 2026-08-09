/**
 * StarsTwinkle — премиальное звёздное небо. Альтернатива CosmicWarp
 * (где звёзды летят на тебя) — здесь звёзды стоят на месте и мерцают.
 *
 * Цель — выглядит как настоящее ночное небо, не как «массив тапов».
 * Что для этого делается:
 *
 *  1. **4 категории звёзд** по размеру и яркости:
 *     - tiny    (≈70%)  — маленькие пылинки, чисто фоновые
 *     - small   (≈20%)  — обычные звёзды
 *     - medium  (≈8%)   — заметные, формируют «созвездия»
 *     - bright  (≈2%)   — крупные с лёгким glow, фокусируют взгляд
 *
 *  2. **4 цвета** (subtle, не яркие):
 *     - white  — чистый
 *     - warm   — тёплая золотистая (как Солнце)
 *     - cool   — холодная голубая (как Сириус)
 *     - gold   — янтарная (старая, охлаждённая звезда)
 *     Распределение случайно, белых ~60%, остальных ~40%.
 *
 *  3. **Кластеризация**: 70% звёзд распределены равномерно,
 *     30% сгруппированы в 2-3 «облака» — имитация Млечного пути.
 *     Без этого небо выглядит сеткой — как фон Bootstrap.
 *
 *  4. **5 разных вариантов мерцания** (keyframes):
 *     - fade   — мягкое дыхание (для большинства)
 *     - pulse  — выраженное появление-исчезновение
 *     - flash  — короткая вспышка (для bright)
 *     - blink  — двойное мигание
 *     - drift  — медленный фейд (медитативный)
 *     Каждой звезде — рандомный вариант.
 *
 *  5. **Падающие звёзды** (shooting stars / метеоры) — 1-2 штуки,
 *     пролетают по диагонали раз в ~30-50 секунд (чтобы не надоедало).
 *
 *  6. **Glow для bright звёзд** — статический box-shadow одного цвета
 *     с самой звездой. Кэшируется браузером, не пересчитывается.
 *
 *  Производительность:
 *   - Все анимации только на opacity + transform → compositor thread,
 *     0 ms main-thread даже на бюджетных Android (Snapdragon 4xx).
 *   - box-shadow растеризуется один раз при первой отрисовке.
 *   - Никаких canvas / SVG / RAF / setInterval — чистый CSS.
 *   - prefers-reduced-motion / saveData / 2g → анимации отключаются,
 *     показываем статичное поле точек.
 */

import { useMemo } from 'react';

/* ── Helpers ─────────────────────────────────────────────────────── */

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (navigator as any).connection as
    | { saveData?: boolean; effectiveType?: string }
    | undefined;
  return !!(c?.saveData || c?.effectiveType === '2g' || c?.effectiveType === 'slow-2g');
}

/** Мульбери32 — детерминированный pseudo-RNG. Одинаковый seed →
 *  одинаковая раскладка, чтобы при ре-рендерах звёзды не «прыгали». */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Палитра ─────────────────────────────────────────────────────── */

type StarColor = 'white' | 'warm' | 'cool' | 'gold';

const COLOR_HEX: Record<StarColor, string> = {
  white: '#ffffff',
  warm: '#FFEEC8',  // солнечно-кремовый
  cool: '#D8E8FF',  // голубоватый
  gold: '#FFD89B',  // янтарный
};

/** Цвет glow для bright-звёзд — чуть более насыщенный чем сам глиф. */
const GLOW_HEX: Record<StarColor, string> = {
  white: 'rgba(255,255,255,0.85)',
  warm: 'rgba(255,220,150,0.80)',
  cool: 'rgba(180,210,255,0.80)',
  gold: 'rgba(255,210,120,0.85)',
};

/* ── Star spec ───────────────────────────────────────────────────── */

type StarTier = 'tiny' | 'small' | 'medium' | 'bright';

type Variant = 'fade' | 'pulse' | 'flash' | 'blink' | 'drift';

type StarSpec = {
  /** % от ширины контейнера */
  x: number;
  /** % от высоты */
  y: number;
  /** Размер в px */
  size: number;
  /** Цвет звезды */
  color: StarColor;
  /** Категория яркости — определяет нужен ли glow */
  tier: StarTier;
  /** Какой keyframe использовать */
  variant: Variant;
  /** Длительность одного цикла мерцания (с) */
  duration: number;
  /** Задержка старта анимации (с) */
  delay: number;
};

/* ── Генерация ───────────────────────────────────────────────────── */

function generateStars(count: number, baseDuration: number): StarSpec[] {
  const rng = mulberry32(0x57415250); // 'WARP'
  const stars: StarSpec[] = [];

  // 2-3 кластера в случайных точках экрана, в которые попадёт ~30% звёзд.
  // Это имитирует «Млечный путь» — небо выглядит органично, а не сеткой.
  const clusterCount = 2 + Math.floor(rng() * 2); // 2 или 3
  const clusters: Array<{ cx: number; cy: number; r: number }> = [];
  for (let i = 0; i < clusterCount; i++) {
    clusters.push({
      cx: 15 + rng() * 70,  // не у самого края
      cy: 10 + rng() * 80,
      r: 18 + rng() * 12,    // радиус 18-30%
    });
  }

  // Подмешиваемая 4-цветная палитра. ~60% белые, остальное распределено.
  const pickColor = (r: number): StarColor => {
    if (r < 0.60) return 'white';
    if (r < 0.78) return 'warm';
    if (r < 0.93) return 'cool';
    return 'gold';
  };

  const pickVariant = (r: number, tier: StarTier): Variant => {
    // bright звёзды любят flash, остальные равномерно
    if (tier === 'bright') return r < 0.6 ? 'flash' : 'pulse';
    if (r < 0.30) return 'fade';
    if (r < 0.55) return 'pulse';
    if (r < 0.75) return 'drift';
    if (r < 0.90) return 'blink';
    return 'flash';
  };

  for (let i = 0; i < count; i++) {
    // Кластерное или равномерное расположение
    let x: number, y: number;
    if (rng() < 0.30) {
      // в кластере
      const cl = clusters[Math.floor(rng() * clusters.length)];
      const angle = rng() * Math.PI * 2;
      const dist = Math.sqrt(rng()) * cl.r; // sqrt → ровное распределение
      x = Math.max(0, Math.min(100, cl.cx + Math.cos(angle) * dist));
      y = Math.max(0, Math.min(100, cl.cy + Math.sin(angle) * dist));
    } else {
      x = rng() * 100;
      y = rng() * 100;
    }

    // Категория размера: 70% tiny / 20% small / 8% medium / 2% bright
    const tierR = rng();
    let tier: StarTier;
    let size: number;
    if (tierR < 0.70) {
      tier = 'tiny';
      size = 0.8 + rng() * 0.6;     // 0.8-1.4 px
    } else if (tierR < 0.90) {
      tier = 'small';
      size = 1.5 + rng() * 0.8;     // 1.5-2.3 px
    } else if (tierR < 0.98) {
      tier = 'medium';
      size = 2.5 + rng() * 1.0;     // 2.5-3.5 px
    } else {
      tier = 'bright';
      size = 3.8 + rng() * 1.4;     // 3.8-5.2 px
    }

    const color = pickColor(rng());
    const variant = pickVariant(rng(), tier);
    // Разброс длительности ±50% — без него все звёзды пульсируют в унисон
    const duration = baseDuration * (0.5 + rng());
    // Большой разброс delay — критично для случайности мерцания
    const delay = rng() * baseDuration * 2.5;

    stars.push({ x, y, size, color, tier, variant, duration, delay });
  }
  return stars;
}

/* ── Component ───────────────────────────────────────────────────── */

type Props = {
  count?: number;
  /** Множитель скорости мерцания (0.3 – 3.0). База — 6 секунд на цикл. */
  speed?: number;
};

export function StarsTwinkle({ count = 240, speed = 1.0 }: Props = {}) {
  const reduced = prefersReducedMotion();
  const baseDuration = 6 / speed;

  const stars = useMemo(
    () => generateStars(count, baseDuration),
    [count, baseDuration],
  );

  // Падающие звёзды — 1 на low/medium, 2 на high+ (чем больше count тем
  // чаще можно их увидеть). На reduced-motion вообще убираем.
  const meteorCount = reduced ? 0 : count <= 80 ? 1 : count <= 240 ? 2 : 3;

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      style={{ background: '#000' }}
    >
      {stars.map((s, i) => {
        const fill = COLOR_HEX[s.color];
        const isBright = s.tier === 'bright';
        const isMedium = s.tier === 'medium';
        // box-shadow только для bright (видимый glow) и слегка для medium.
        // Растеризуется один раз при первой отрисовке, не пересчитывается
        // на каждый кадр анимации (анимация трогает только opacity/scale).
        const glow = isBright
          ? `0 0 ${Math.round(s.size * 2)}px ${GLOW_HEX[s.color]}, 0 0 ${Math.round(s.size * 4)}px ${GLOW_HEX[s.color].replace(/[\d.]+\)$/, '0.35)')}`
          : isMedium
            ? `0 0 ${Math.round(s.size * 1.5)}px ${GLOW_HEX[s.color].replace(/[\d.]+\)$/, '0.35)')}`
            : 'none';

        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              borderRadius: '50%',
              background: fill,
              boxShadow: glow,
              animation: reduced
                ? 'none'
                : `twinkle-${s.variant} ${s.duration.toFixed(2)}s ease-in-out ${s.delay.toFixed(2)}s infinite`,
              opacity: reduced ? (isBright ? 0.85 : 0.55) : undefined,
              willChange: reduced ? undefined : 'opacity, transform',
            }}
          />
        );
      })}

      {/* Падающие звёзды — узкая полоса с градиентным хвостом, проходит
          по диагонали и исчезает. Очень редко — каждые 30-60 сек. Не
          раздражает, но добавляет «жизнь» небу. */}
      {!reduced && Array.from({ length: meteorCount }).map((_, i) => (
        <span
          key={`m${i}`}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: `${10 + i * 25}%`,
            left: '-10%',
            width: 80,
            height: 1,
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 60%, rgba(255,255,255,0) 100%)',
            opacity: 0,
            transform: 'rotate(15deg)',
            transformOrigin: 'left center',
            animation: `meteor ${30 + i * 12}s linear ${i * 14}s infinite`,
            willChange: 'transform, opacity',
          }}
        />
      ))}

      <style>{`
        /* fade — мягкое «дыхание». Базовый вариант для большинства. */
        @keyframes twinkle-fade {
          0%, 100% { opacity: 0.20; transform: scale(0.85); }
          50%      { opacity: 0.85; transform: scale(1.05); }
        }
        /* pulse — выраженный пульс с большим контрастом. */
        @keyframes twinkle-pulse {
          0%, 100% { opacity: 0.10; transform: scale(0.7); }
          45%, 55% { opacity: 1.00; transform: scale(1.10); }
        }
        /* flash — короткая вспышка на 80% цикла тусклая, потом резкий пик.
           Подходит для bright-звёзд, имитирует далёкие яркие. */
        @keyframes twinkle-flash {
          0%, 100%   { opacity: 0.08; transform: scale(0.75); }
          40%, 50%   { opacity: 1.00; transform: scale(1.20); }
          60%        { opacity: 0.30; transform: scale(0.95); }
        }
        /* blink — двойная вспышка: разгорелась-погасла-разгорелась. */
        @keyframes twinkle-blink {
          0%, 100%      { opacity: 0.15; transform: scale(0.85); }
          25%           { opacity: 0.85; transform: scale(1.05); }
          40%           { opacity: 0.30; transform: scale(0.90); }
          60%           { opacity: 0.95; transform: scale(1.10); }
          75%           { opacity: 0.40; transform: scale(0.95); }
        }
        /* drift — очень медленный, медитативный фейд. */
        @keyframes twinkle-drift {
          0%, 100% { opacity: 0.30; transform: scale(0.92); }
          50%      { opacity: 0.70; transform: scale(1.02); }
        }
        /* meteor — падающая звезда. Большой простой keyframe:
           80% времени звезда невидима (opacity 0), потом быстро летит
           через экран по диагонали с появлением и исчезновением. */
        @keyframes meteor {
          0%, 80%   { opacity: 0; transform: rotate(15deg) translateX(0) translateY(0); }
          82%       { opacity: 1; }
          90%       { opacity: 1; }
          95%       { opacity: 0.5; }
          100%      { opacity: 0; transform: rotate(15deg) translateX(120vw) translateY(20vh); }
        }
      `}</style>
    </div>
  );
}
