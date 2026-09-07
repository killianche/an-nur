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

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { ChevronLeft } from './icons';
import { GLASS_BLUR } from '../lib/glass';

/** Высота самой капсулы. */
export const SCREEN_HEADER_HEIGHT = 64;
/** Зазор между капсулой и верхней безопасной областью.
 *
 * Было 8. Владелец 07.09.2026: «как будто бы можно уменьшить отступ сверху,
 * чтобы оно немножко выше подтянуто было на всём сайте». Уменьшено до 4:
 * панель поднимается на четыре точки на ВСЕХ экранах разом, потому что от
 * этой константы считается и её положение, и отступ контента под ней
 * (`screenHeaderOffset`). Меньше четырёх ставить не стал — капсула начинает
 * липнуть к строке состояния, и стекло сливается с ней. */
const CAPSULE_TOP = 4;
/** Зазор от боковых краёв экрана. */
const CAPSULE_SIDE = 12;

/** Длительность выезда/ухода панели — держим рядом с разметкой, чтобы
 *  флаг will-change снимался ровно после перехода, а не «примерно». */
const HIDE_TRANSITION_MS = 180;

/**
 * Готовый отступ сверху для контента под панелью.
 *
 * 🔴 Считает ВСЁ занятое панелью место, вместе с зазором до безопасной
 * области: панель плавающая, и без зазора в расчёте первая строка экрана
 * уходила бы под стекло. Оно полупрозрачное, поэтому такая ошибка не
 * выглядит как ошибка — текст «вроде виден», просто не читается.
 */
export const screenHeaderOffset = (extra = 0) =>
  `calc(${SCREEN_HEADER_HEIGHT + CAPSULE_TOP + extra}px + env(safe-area-inset-top))`;

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
  title, subtitle, onBack, actions = [], progress, visible = true,
}: {
  title: string;
  /** Мелкая строка под заголовком — например «3 / 16». */
  subtitle?: string;
  onBack: () => void;
  actions?: HeaderAction[];
  /** 0..1 — тонкая полоса по нижней кромке (прогресс по ленте). */
  progress?: number;
  /** Визуально скрыть панель, не размонтируя её и не меняя геометрию контента. */
  visible?: boolean;
}) {
  // `will-change` живёт ровно столько, сколько идёт переход.  Постоянный
  // флаг на элементе с backdrop-filter заставляет WebKit держать слой с
  // размытием всё время, пока экран открыт, — а анимация случается на
  // единичные тапы.  Ожидание на setTimeout, а не на requestAnimationFrame:
  // в скрытой вкладке rAF не тикает и флаг остался бы висеть навсегда.
  const [animating, setAnimating] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setAnimating(true);
    const id = setTimeout(() => setAnimating(false), HIDE_TRANSITION_MS + 60);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <header
      role="banner"
      className="screen-header liquid-glass"
      data-animating={animating}
      style={{
        ...GLASS_BLUR,
        position: 'fixed',
        top: `calc(env(safe-area-inset-top) + ${CAPSULE_TOP}px)`,
        left: `${CAPSULE_SIDE}px`,
        right: `${CAPSULE_SIDE}px`,
        zIndex: 30,
        height: `${SCREEN_HEADER_HEIGHT}px`,
        boxSizing: 'border-box',
        borderRadius: '24px',
        overflow: 'hidden',
        // Уезжает выше собственной высоты вместе с зазором и безопасной
        // областью — иначе край стекла остаётся торчать под часами.
        transform: visible
          ? 'translate3d(0, 0, 0)'
          : `translate3d(0, calc(-100% - ${CAPSULE_TOP}px - env(safe-area-inset-top)), 0)`,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition:
          'transform var(--dur-base) var(--ease-panel),'
          + ' opacity var(--dur-fast) var(--ease-standard)',
      }}
      aria-hidden={!visible}
    >
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-tight)',
        padding: '0 var(--space-snug)',
        // Тот же предел ширины, что у контента экранов, чтобы на
        // планшете кнопки не разъезжались по краям стекла.
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <button
          onClick={() => {
            if (Capacitor.getPlatform() === 'ios') void Haptics.selectionChanged();
            onBack();
          }}
          aria-label="Назад"
          className="icon-btn ios-header-button ios-header-back"
          style={{
            // Ведущая кнопка на ступень крупнее минимальных 44×44:
            // «назад» жмут вслепую, у самого края экрана.
            width: '48px', height: '48px', flexShrink: 0,
            color: 'var(--text-primary)',
          }}
        >
          <ChevronLeft size={24} />
        </button>

        <div style={{ minWidth: 0, flex: 1, padding: '0 var(--space-tight)' }}>
          <div
            className="display-serif"
            style={{
              // Title 3 — ближайшая ступень iOS к прежним 19px.  Nav-bar
              // Headline (17) в панели высотой 64 читался бы потерянно.
              fontSize: 'var(--font-title3)',
              lineHeight: 'var(--leading-title3)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
              letterSpacing: 'var(--tracking-tight)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontSize: 'var(--font-footnote)',
              lineHeight: 'var(--leading-footnote)',
              color: 'var(--text-tertiary)',
              letterSpacing: 'var(--tracking-loose)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {subtitle}
            </div>
          )}
        </div>

        {actions.length > 0 && (
          <div className="ios-header-actions">
            {actions.map(a => (
              <button
                key={a.key}
                ref={a.ref}
                onClick={() => {
                  if (Capacitor.getPlatform() === 'ios') void Haptics.selectionChanged();
                  a.onClick();
                }}
                aria-label={a.label}
                title={a.label}
                className="icon-btn ios-header-button"
                data-active={a.active}
                style={{
                  width: 'var(--hit-min)', height: 'var(--hit-min)', flexShrink: 0,
                  color: a.active ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {a.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {progress != null && (
        <div
          aria-hidden
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: '2px', background: 'transparent',
          }}
        >
          {/* scaleX, а не width: ширина — свойство лейаута, и её анимация
              заставляет браузер пересчитывать раскладку на каждом кадре.
              Полоса живёт в шапке над лентой тяжёлого арабского текста и
              обновляется всё время воспроизведения — это ровно то место,
              где такой пересчёт стоит дорого. transform считается
              композитором и лейаут не трогает.

              transform-origin слева: полоса растёт от начала строки. */}
          <div style={{
            height: '100%',
            width: '100%',
            transformOrigin: 'left center',
            transform: `scaleX(${Math.min(1, Math.max(0, progress)).toFixed(4)})`,
            background: 'var(--text-primary)',
            opacity: 0.7,
            transition: 'transform var(--dur-base) var(--ease-standard)',
            willChange: 'transform',
          }} />
        </div>
      )}
    </header>
  );
}
