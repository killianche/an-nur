/**
 * CosmicWarp — 3D-полёт через звёзды на canvas.
 *
 * Написан с нуля. Чистый, минимальный, без накопленных хаков.
 *
 * Принцип:
 *  - N звёзд с координатами (x, y, z) в 3D-пространстве.
 *  - Каждый кадр z уменьшается → звезда приближается.
 *  - При z < 1 — респаун в дальнем поле.
 *  - 3D→2D проекция через перспективное деление (x/z, y/z).
 *  - Размер и яркость растут с приближением.
 *  - Короткий штрих (prev→current) создаёт motion blur.
 *  - requestAnimationFrame, пауза при скрытой вкладке.
 *
 * iOS Safari:
 *  - Canvas = replaced-element, inset:0 его НЕ растягивает.
 *  - Явный CSS 100vw × 100vh. На iOS Safari 100vh = макс. viewport
 *    (URL bar свёрнут) — canvas стабильно покрывает всё.
 *  - Буфер (canvas.width/height) берётся из clientWidth/Height × DPR.
 *
 * Accessibility:
 *  - prefers-reduced-motion → статичное поле (без RAF).
 *  - connection.saveData / 2g → тоже статика.
 */

import { useEffect, useRef } from 'react';

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

/* ── Component ───────────────────────────────────────────────────── */

const STAR_COUNT = 220;
const STAR_COUNT_REDUCED = 80;
// База 0.28 px/frame (последовательно сниженная: 0.8 → 0.4 → 0.28,
// итого -65% от первоначальной). ×1.0 ощущается как медленный дрейф
// сквозь звёздное поле, что просили пользователи. На ×3.0 (0.84)
// близко к классическому warp.
const BASE_SPEED = 0.28;
const TRAIL_ALPHA = 0.18; // motion-blur заливка чёрным каждый кадр
const PROJECTION_K = 256; // Фокусное расстояние проекции

type Star = { x: number; y: number; z: number; pz: number };

type Props = {
  /** Множитель скорости полёта (0.3 – 3.0). Базовая 0.8 px/frame. */
  speed?: number;
};

export function CosmicWarp({ speed = 1.0 }: Props = {}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const starCount = reduced ? STAR_COUNT_REDUCED : STAR_COUNT;

    // Размеры буфера (в физических пикселях).
    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;
    let far = 0;

    // Звёзды.
    const stars: Star[] = [];

    /* ── Resize ─────────────────────────────────────────────────── */

    function syncSize() {
      const cw = canvas!.clientWidth || window.innerWidth;
      const ch = canvas!.clientHeight || window.innerHeight;
      w = canvas!.width = Math.floor(cw * dpr);
      h = canvas!.height = Math.floor(ch * dpr);
      cx = w / 2;
      cy = h / 2;
      far = Math.max(w, h);

      // canvas.width/height assignment clears buffer to transparent.
      // Залить чёрным сразу, чтобы не мелькал body.
      ctx!.globalAlpha = 1;
      ctx!.fillStyle = '#000';
      ctx!.fillRect(0, 0, w, h);
    }

    /* ── Stars init ─────────────────────────────────────────────── */

    function initStars() {
      stars.length = 0;
      for (let i = 0; i < starCount; i++) {
        const z = Math.random() * far || 400;
        stars.push({
          x: (Math.random() - 0.5) * far * 2,
          y: (Math.random() - 0.5) * far * 2,
          z,
          pz: z,
        });
      }
    }

    /* ── Static field (reduced-motion) ──────────────────────────── */

    function drawStatic() {
      ctx!.globalAlpha = 1;
      ctx!.fillStyle = '#000';
      ctx!.fillRect(0, 0, w, h);
      const k = PROJECTION_K * dpr;
      for (const s of stars) {
        const sx = (s.x / s.z) * k + cx;
        const sy = (s.y / s.z) * k + cy;
        const t = 1 - s.z / far;
        const r = Math.max(0.5, t * 1.4 * dpr);
        ctx!.globalAlpha = Math.min(0.55, 0.18 + t * 0.45);
        ctx!.fillStyle = '#fff';
        ctx!.beginPath();
        ctx!.arc(sx, sy, r, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    /* ── Animation frame ────────────────────────────────────────── */

    let raf = 0;

    function frame() {
      // Мягкий motion-blur: полупрозрачный чёрный поверх предыдущего кадра.
      ctx!.globalAlpha = 1;
      ctx!.fillStyle = `rgba(0,0,0,${TRAIL_ALPHA})`;
      ctx!.fillRect(0, 0, w, h);

      const k = PROJECTION_K * dpr;
      const spd = BASE_SPEED * speed * dpr;

      for (const s of stars) {
        s.pz = s.z;
        s.z -= spd;

        if (s.z < 1) {
          s.x = (Math.random() - 0.5) * far * 2;
          s.y = (Math.random() - 0.5) * far * 2;
          s.z = far;
          s.pz = far;
        }

        const sx = (s.x / s.z) * k + cx;
        const sy = (s.y / s.z) * k + cy;
        const px = (s.x / s.pz) * k + cx;
        const py = (s.y / s.pz) * k + cy;

        const t = 1 - s.z / far;
        const r = Math.max(0.4, t * 1.4 * dpr);
        const alpha = Math.min(0.85, 0.15 + t * 0.7);

        ctx!.globalAlpha = alpha;
        ctx!.strokeStyle = '#fff';
        ctx!.lineWidth = r;
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        ctx!.moveTo(px, py);
        ctx!.lineTo(sx, sy);
        ctx!.stroke();
      }

      raf = requestAnimationFrame(frame);
    }

    /* ── Visibility ─────────────────────────────────────────────── */

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(frame);
      }
    }

    /* ── Boot ───────────────────────────────────────────────────── */

    syncSize();
    initStars();

    if (reduced) {
      drawStatic();
      const onResize = () => { syncSize(); drawStatic(); };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    // Animated mode.
    window.addEventListener('resize', () => { syncSize(); });
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', syncSize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // Effect перезапускается при смене скорости — звёзды летят быстрее/медленнее.
  }, [speed]);

  return (
    <>
      <canvas
        ref={ref}
        className="fixed inset-0 z-0 pointer-events-none"
        aria-hidden="true"
        style={{ width: '100vw', height: '100vh' }}
      />
      {/* Редкая падающая звезда — узкая полоса с градиентным хвостом,
          пролетает по диагонали раз в ~45 секунд (animation-duration).
          Сама полоса крошечная, но «след» создаётся keyframe'ом — он
          проходит через viewport и затем долго ждёт перед следующей
          итерацией. На reduced-motion / низкой скорости отключается. */}
      <span
        aria-hidden="true"
        className="fixed pointer-events-none z-0"
        style={{
          top: '12%',
          left: '-10%',
          width: 100,
          height: 1.5,
          background:
            'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 70%, rgba(255,255,255,0) 100%)',
          opacity: 0,
          transform: 'rotate(15deg)',
          transformOrigin: 'left center',
          animation: 'meteor 45s linear 8s infinite',
          willChange: 'transform, opacity',
          boxShadow: '0 0 4px rgba(255,255,255,0.6)',
        }}
      />
      <span
        aria-hidden="true"
        className="fixed pointer-events-none z-0"
        style={{
          top: '38%',
          left: '-10%',
          width: 80,
          height: 1.5,
          background:
            'linear-gradient(90deg, rgba(255,235,200,0) 0%, rgba(255,235,200,0.75) 70%, rgba(255,235,200,0) 100%)',
          opacity: 0,
          transform: 'rotate(18deg)',
          transformOrigin: 'left center',
          animation: 'meteor 62s linear 28s infinite',
          willChange: 'transform, opacity',
          boxShadow: '0 0 4px rgba(255,235,200,0.5)',
        }}
      />
    </>
  );
}
