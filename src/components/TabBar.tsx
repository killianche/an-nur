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

import { useRef, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { BookOpen, Sparkle, Clock, Flower, Person } from './icons';
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
  { id: 'quran', label: 'Коран', icon: selected => <BookOpen size={TAB_ICON} isFilled={selected} /> },
  { id: 'azkar', label: 'Азкары', icon: selected => <Sparkle size={TAB_ICON} isFilled={selected} /> },
  { id: 'dua', label: 'Дуа', icon: selected => <Flower size={TAB_ICON} isFilled={selected} /> },
  { id: 'prayer', label: 'Намаз', icon: selected => <Clock size={TAB_ICON} isFilled={selected} /> },
  { id: 'account', label: 'Аккаунт', icon: selected => <Person size={TAB_ICON} isFilled={selected} /> },
];

/** Высота самой капсулы. */
const CAPSULE_HEIGHT = 64;
/** Зазор между капсулой и нижним краем безопасной области. */
const CAPSULE_INSET = 10;
/** Зазор от боковых краёв экрана. */
const CAPSULE_SIDE = 12;

/** Сколько места панель занимает снизу — см. предупреждение в шапке. */
export const TAB_BAR_HEIGHT = CAPSULE_HEIGHT + CAPSULE_INSET;

/** Максимальная пауза между двумя тапами по активной вкладке. */
const DOUBLE_TAP_MS = 420;

export function TabBar({ active, onSelect }: {
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  const lastActiveTapRef = useRef<{ id: TabId; at: number } | null>(null);

  return (
    <nav
      aria-label="Разделы"
      className="liquid-glass"
      style={{
        ...GLASS_BLUR,
        position: 'fixed',
        left: `${CAPSULE_SIDE}px`,
        right: `${CAPSULE_SIDE}px`,
        bottom: `calc(env(safe-area-inset-bottom) + ${CAPSULE_INSET}px)`,
        zIndex: 40,
        height: `${CAPSULE_HEIGHT}px`,
        boxSizing: 'border-box',
        // Радиус чуть меньше половины высоты: полная капсула на пять
        // подписей выглядит аптечной пилюлей, а не панелью.
        borderRadius: '26px',
        // На планшете панель не растягивается во всю ширину: ряд из пяти
        // вкладок шириной в лист выглядит потерянным.
        maxWidth: '560px',
        margin: '0 auto',
        overflow: 'hidden',
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
                padding: 'var(--space-tight) var(--space-hair)',
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
                  height: '32px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-pill)',
                  background: selected
                    ? 'color-mix(in srgb, var(--text-primary) 9%, transparent)'
                    : 'transparent',
                  transform: selected ? 'scale(1)' : 'scale(0.96)',
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
