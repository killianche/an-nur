/**
 * ScreenHeader — верхняя панель экранов, открывающихся «поверх»
 * (чтение суры, закладки, лента азкаров).
 *
 * Обычная панель во всю ширину, а не плавающая пилюля.  Причины:
 *
 *  • Пилюля висела по центру и «съедала» текст под собой: она
 *    полупрозрачная, и строки аята просвечивали сквозь неё.  Панель во
 *    всю ширину честно отделяет chrome от контента линией.
 *  • Кнопки в пилюле стояли не там, где их ищет рука: «назад» уезжал к
 *    середине экрана вместо левого края.
 *  • Нижняя панель вкладок уже сделана как обычная системная — верх и
 *    низ должны читаться одной системой.  Здесь тот же приём:
 *    полупрозрачная поверхность, hairline-граница, backdrop-blur.
 *
 * Раскладка: [ ‹ ]  Заголовок …  [действие] [действие] [действие]
 *
 * Заголовок прижат к кнопке «назад», а не отцентрован.  При трёх
 * действиях справа центрированный заголовок на узком экране либо
 * наезжает на них, либо приходится резать до двух слов; выравнивание
 * по левому краю даёт ему всю оставшуюся ширину.
 *
 * Высота 52 pt плюс safe-area сверху — панель заходит под «чёлку»
 * своим фоном, но содержимое остаётся ниже неё.
 */

import type { ReactNode } from 'react';
import { ChevronLeft } from './icons';

/** Высота панели без safe-area.  Экраны отводят под неё верхний
 *  отступ — экспортируем, чтобы значение не разъезжалось по файлам. */
export const SCREEN_HEADER_HEIGHT = 52;

/** Готовый отступ сверху для контента под панелью. */
export const screenHeaderOffset = (extra = 0) =>
  `calc(${SCREEN_HEADER_HEIGHT + extra}px + env(safe-area-inset-top))`;

export type HeaderAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Кнопка в «нажатом» состоянии — открыт её попап. */
  active?: boolean;
  /** Ref нужен попаповам: они якорятся под своей кнопкой. */
  ref?: React.Ref<HTMLButtonElement>;
};

export function ScreenHeader({
  title, subtitle, onBack, actions = [], progress,
}: {
  title: string;
  /** Мелкая строка под заголовком — например «3 / 16». */
  subtitle?: string;
  onBack: () => void;
  actions?: HeaderAction[];
  /** 0..1 — тонкая полоса по нижней кромке (прогресс по ленте). */
  progress?: number;
}) {
  return (
    <header
      role="banner"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        paddingTop: 'env(safe-area-inset-top)',
        background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
        borderBottom: '1px solid var(--hairline)',
        backdropFilter: 'saturate(160%) blur(20px)',
        WebkitBackdropFilter: 'saturate(160%) blur(20px)',
      }}
    >
      <div style={{
        height: `${SCREEN_HEADER_HEIGHT}px`,
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '0 6px',
        // Тот же предел ширины, что у контента экранов, чтобы на
        // планшете кнопки не разъезжались по краям стекла.
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <button
          onClick={onBack}
          aria-label="Назад"
          className="icon-btn"
          style={{
            width: '44px', height: '44px', flexShrink: 0,
            color: 'var(--text-primary)',
          }}
        >
          <ChevronLeft size={22} />
        </button>

        <div style={{ minWidth: 0, flex: 1, padding: '0 4px' }}>
          <div
            className="display-serif"
            style={{
              fontSize: '17px', fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: '-0.012em',
              lineHeight: 1.15,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontSize: '11.5px',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.01em',
              lineHeight: 1.2,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {subtitle}
            </div>
          )}
        </div>

        {actions.map(a => (
          <button
            key={a.key}
            ref={a.ref}
            onClick={a.onClick}
            aria-label={a.label}
            title={a.label}
            className="icon-btn"
            data-active={a.active}
            style={{
              width: '42px', height: '42px', flexShrink: 0,
              color: a.active ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            {a.icon}
          </button>
        ))}
      </div>

      {progress != null && (
        <div
          aria-hidden
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: '2px', background: 'transparent',
          }}
        >
          <div style={{
            height: '100%',
            width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
            background: 'var(--text-primary)',
            opacity: 0.7,
            transition: 'width 220ms ease',
          }} />
        </div>
      )}
    </header>
  );
}
