/**
 * TabBar — общая нижняя навигация Web / iOS / Android.
 *
 * Панель — плавающая стеклянная капсула, отделённая от краёв экрана.
 * Содержимое подтекает под неё, а не упирается в глухую полосу: это и
 * читается как стекло. Рецепт самого стекла общий с шапкой — класс
 * `.liquid-glass` в `index.css`, чтобы две панели не разъехались по
 * прозрачности и тени.
 *
 * 🔴 `TAB_BAR_HEIGHT` — не высота капсулы, а всё занятое ею место снизу,
 * вместе с зазором до края. Шесть экранов считают по нему нижний отступ
 * содержимого (`SurahPicker`, `AccountScreen`, `DuaScreen`,
 * `PrayerTimesScreen`, `ComingSoonScreen` и другие). Если экспортировать
 * высоту самой капсулы, последняя строка списка окажется под стеклом —
 * молча, потому что стекло полупрозрачное и текст под ним «вроде виден».
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { TabQuran, TabAzkar, TabPrayer, Flower, Person } from './icons';
import { GLASS_BLUR } from '../lib/glass';

export type TabId = 'quran' | 'azkar' | 'dua' | 'prayer' | 'account';

/** Размер глифа вкладки — ступень `--icon-tab` из общей шкалы.  В JSX
 *  он приходит числом (иконки принимают `size`), поэтому значение здесь
 *  и в CSS-токене нужно держать одинаковым.
 *
 *  Было 28 при подписи в 11px — глиф перевешивал строку, и панель читалась
 *  тяжелее, чем весь остальной экран. 25 возвращает привычную для панели
 *  иерархию: сначала узнаётся значок, потом дочитывается подпись. */
const TAB_ICON = 25;

const TABS: { id: TabId; label: string; icon: (selected: boolean) => ReactNode }[] = [
  { id: 'quran', label: 'Коран', icon: selected => <TabQuran size={TAB_ICON} isFilled={selected} /> },
  { id: 'azkar', label: 'Азкары', icon: selected => <TabAzkar size={TAB_ICON} isFilled={selected} /> },
  { id: 'dua', label: 'Дуа', icon: selected => <Flower size={TAB_ICON} isFilled={selected} /> },
  { id: 'prayer', label: 'Намаз', icon: selected => <TabPrayer size={TAB_ICON} isFilled={selected} /> },
  { id: 'account', label: 'Аккаунт', icon: selected => <Person size={TAB_ICON} isFilled={selected} /> },
];

/**
 * Высота содержимого панели — без безопасной зоны внизу.
 *
 * 49 — системная высота панели вкладок в iOS: значок 25, зазор, подпись
 * caption 2. Безопасную зону прибавляют потребители этой константы сами
 * (`calc(TAB_BAR_HEIGHT + … + env(safe-area-inset-bottom))`), поэтому
 * включать её сюда нельзя — отступ удвоится.
 */
const BAR_HEIGHT = 62;
/** Насколько панель сжимается при прокрутке вниз. */
const BAR_HEIGHT_MIN = 44;
/** Зазор до нижнего края безопасной области и до боковых краёв. */
const BAR_INSET = 10;
const BAR_SIDE = 14;

/** Сколько места панель занимает снизу — см. предупреждение в шапке. */
export const TAB_BAR_HEIGHT = BAR_HEIGHT + BAR_INSET;

/** Максимальная пауза между двумя тапами по активной вкладке. */
const DOUBLE_TAP_MS = 420;

export function TabBar({ active, onSelect }: {
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  const lastActiveTapRef = useRef<{ id: TabId; at: number } | null>(null);

  /**
   * Сжатие при прокрутке — главная черта нижнего меню iOS 26.
   *
   * Вниз — панель ужимается и прячет подписи, освобождая экран под текст.
   * Вверх или у самого верха — разворачивается обратно. Порог в 4 px гасит
   * дрожание пальца, иначе панель мигала бы на каждом кадре.
   *
   * При включённом «уменьшении движения» не сжимаемся вовсе: для человека,
   * который просил меньше анимаций, скачущая панель — раздражитель, а не
   * украшение.
   */
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const dy = y - last;
        last = y;
        if (y < 48) { setCollapsed(false); return; }
        if (dy > 4) setCollapsed(true);
        else if (dy < -4) setCollapsed(false);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <nav
      aria-label="Разделы"
      className="liquid-glass"
      style={{
        ...GLASS_BLUR,
        // Плавающая капсула «жидкого стекла» — как нижнее меню в iOS 26.
        //
        // Решения владельца по этой панели менялись: 04.09.2026 он выбрал
        // системную панель во всю ширину, 05.09 — вернуться к плавающей, но
        // «как в последней iOS». Поэтому здесь именно черты iOS 26: панель
        // висит НАД содержимым с отступами от краёв, полностью скруглена и
        // СЖИМАЕТСЯ при прокрутке вниз, разворачиваясь при прокрутке вверх
        // (`.tabBarMinimizeBehavior(.onScrollDown)` у Apple).
        //
        // Точных величин Apple не публикует — высоты и радиус подобраны на
        // глаз по отрисовке, а не взяты из документации.
        position: 'fixed',
        left: `${BAR_SIDE}px`,
        right: `${BAR_SIDE}px`,
        bottom: `calc(env(safe-area-inset-bottom) + ${BAR_INSET}px)`,
        zIndex: 40,
        height: `${collapsed ? BAR_HEIGHT_MIN : BAR_HEIGHT}px`,
        boxSizing: 'border-box',
        borderRadius: `${(collapsed ? BAR_HEIGHT_MIN : BAR_HEIGHT) / 2}px`,
        // Кромка стекла: светлая линия сверху ловит свет, общая рамка держит
        // форму на любом фоне.
        border: '1px solid rgb(var(--surface-rgb) / 0.55)',
        boxShadow:
          '0 8px 30px rgb(var(--ink-rgb) / 0.16),'
          + ' inset 0 1px 0 rgb(var(--surface-rgb) / 0.65)',
        maxWidth: '520px',
        margin: '0 auto',
        overflow: 'hidden',
        transition:
          'height var(--dur-slow) var(--ease-panel),'
          + ' border-radius var(--dur-slow) var(--ease-panel)',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
        }}
      >
        {TABS.map(tab => {
          const selected = tab.id === active;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === active) {
                  if (tab.id !== 'quran') return;
                  const now = performance.now();
                  const previous = lastActiveTapRef.current;
                  const isDoubleTap = previous?.id === tab.id
                    && now - previous.at <= DOUBLE_TAP_MS;

                  if (!isDoubleTap) {
                    lastActiveTapRef.current = { id: tab.id, at: now };
                    return;
                  }

                  lastActiveTapRef.current = null;
                  if (Capacitor.getPlatform() === 'ios') void Haptics.selectionChanged();
                  onSelect(tab.id);
                  return;
                }

                lastActiveTapRef.current = null;
                if (Capacitor.getPlatform() === 'ios') void Haptics.selectionChanged();
                onSelect(tab.id);
              }}
              aria-current={selected ? 'page' : undefined}
              aria-label={tab.label}
              className="ios-tab-item"
              data-active={selected}
              style={{
                minWidth: 0,
                height: '100%',
                padding: '0 var(--space-hair)',
                border: 'none',
                borderRadius: 0,
                background: 'transparent',
                color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-hair)',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                transition:
                  'color var(--dur-base) var(--ease-standard),'
                  + ' transform var(--dur-base) var(--ease-panel)',
              }}
            >
              <span
                aria-hidden="true"
                className="ios-tab-icon"
                style={{
                  // Подложка шире иконки: 42×34 давала почти круг, и
                  // залитый глиф выбранной вкладки читался в нём пятном.
                  // Вытянутая капсула возвращает иконке форму.
                  width: '52px',
                  height: '28px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-pill)',
                  // Подложки под выбранной вкладкой нет: в iOS выбранное
                  // отличается цветом и залитым глифом, а капсула под
                  // значком — приём Material, не системы Apple.
                  background: 'transparent',
                  transform: 'none',
                  transition:
                    'background var(--dur-base) var(--ease-standard),'
                    + ' transform var(--dur-slow) var(--ease-panel)',
                }}
              >
                {tab.icon(selected)}
              </span>
              <span
                style={{
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  // В сжатом виде подписи уходят — как в iOS 26. Высота при
                  // этом схлопывается вместе с ними, поэтому текст не
                  // «выпрыгивает» из капсулы во время перехода.
                  height: collapsed ? 0 : undefined,
                  opacity: collapsed ? 0 : 1,
                  transition:
                    'opacity var(--dur-base) var(--ease-standard),'
                    + ' height var(--dur-slow) var(--ease-panel)',
                  // Caption 2 (11/13) — нижняя ступень iOS и одновременно
                  // минимальный кегль, который Apple разрешает в
                  // интерфейсе.  Начертания только те два, что реально
                  // подключены: 650 и 500 браузер всё равно сводил к 600
                  // и 400, просто менее предсказуемо.
                  fontSize: 'var(--font-caption2)',
                  lineHeight: 'var(--leading-caption2)',
                  fontWeight: selected
                    ? 'var(--weight-semibold)'
                    : 'var(--weight-regular)',
                  letterSpacing: 'var(--tracking-tight)',
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
