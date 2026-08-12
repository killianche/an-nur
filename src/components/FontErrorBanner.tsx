/**
 * FontErrorBanner — «шрифт мусхафа не приехал, попробовать ещё раз».
 *
 * ── Почему это отдельное состояние, а не молчание ─────────────────────
 *
 * Слова мусхафа — готовые глифы в приватной области Unicode.  Если файл
 * не загрузился, показать текст нечем: системные шрифты этих кодов не
 * знают и рисуют ряды пустых квадратов.  Кубики на месте аята выглядят
 * как испорченный Коран, поэтому текст в таком случае не рисуется вовсе
 * (см. useQcfFont) — а человеку нужно объяснить, почему на экране
 * заготовки строк, и дать кнопку.
 *
 * ── Почему одна плашка на экран ───────────────────────────────────────
 *
 * Не приезжает обычно не один файл, а страница целиком, то есть сразу
 * десяток аятов.  Сообщение у каждого превратило бы чтение в список
 * ошибок; общая строка сверху говорит то же самое один раз.
 *
 * Повтор общий: он пересоздаёт правила для всех неудавшихся семейств
 * разом, потому что причина у них одна — сеть.
 */

import { useQcfFontFailure } from '../hooks/useQcfFont';

export function FontErrorBanner() {
  const { failed, retry } = useQcfFontFailure();
  if (!failed) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        margin: '8px 0 16px',
        padding: '12px 14px',
        borderRadius: '14px',
        border: '1px solid var(--hairline-strong)',
        background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
      }}
    >
      <span style={{
        flex: 1,
        minWidth: 0,
        fontSize: '14px',
        lineHeight: 1.4,
        color: 'var(--text-secondary)',
      }}>
        Не удалось загрузить шрифт мусхафа. Арабский текст появится, когда
        файл дойдёт.
      </span>
      <button
        onClick={retry}
        style={{
          flexShrink: 0,
          minHeight: '34px',
          padding: '0 14px',
          borderRadius: '9999px',
          border: '1px solid var(--hairline-strong)',
          background: 'transparent',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Повторить
      </button>
    </div>
  );
}
