/**
 * TabBar — общая нижняя навигация Web / iOS / Android.
 *
 * Геометрия повторяет системную iOS-панель: 49 pt занимает ряд вкладок,
 * нижняя safe-area входит в фон самой панели, а не превращается в пустой
 * зазор под плавающей капсулой. Внешней тени и отдельного «тумана» нет —
 * разделение с контентом даёт только полупрозрачный материал и hairline.
 */

import { useRef, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { BookOpen, Sparkle, Clock, Flower, Person } from './icons';

export type TabId = 'quran' | 'azkar' | 'dua' | 'prayer' | 'account';

/** Размер глифа вкладки — ступень `--icon-tab` из общей шкалы.  В JSX
 *  он приходит числом (иконки принимают `size`), поэтому значение здесь
 *  и в CSS-токене нужно держать одинаковым. */
const TAB_ICON = 28;

const TABS: { id: TabId; label: string; icon: (selected: boolean) => ReactNode }[] = [
  { id: 'quran', label: 'Коран', icon: selected => <BookOpen size={TAB_ICON} isFilled={selected} /> },
  { id: 'azkar', label: 'Азкары', icon: selected => <Sparkle size={TAB_ICON} isFilled={selected} /> },
  { id: 'dua', label: 'Дуа', icon: selected => <Flower size={TAB_ICON} isFilled={selected} /> },
  { id: 'prayer', label: 'Намаз', icon: selected => <Clock size={TAB_ICON} isFilled={selected} /> },
  { id: 'account', label: 'Аккаунт', icon: selected => <Person size={TAB_ICON} isFilled={selected} /> },
];

/** Системная высота ряда вкладок iPhone без нижней safe-area. */
export const TAB_BAR_HEIGHT = 64;

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
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        height: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxSizing: 'border-box',
        background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
        // Одно значение размытия на всю навигацию (было 32px): широкий
        // радиус дорог в WKWebView на каждом кадре прокрутки, а на
        // полупрозрачной панели разницы с 16px не видно.
        backdropFilter: 'saturate(var(--saturate-chrome)) blur(var(--blur-chrome))',
        WebkitBackdropFilter: 'saturate(var(--saturate-chrome)) blur(var(--blur-chrome))',
        borderTop: '0.5px solid var(--hairline)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          height: `${TAB_BAR_HEIGHT}px`,
          margin: '0 auto',
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
                height: `${TAB_BAR_HEIGHT}px`,
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
                  width: '42px',
                  height: '34px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-pill)',
                  background: selected
                    ? 'color-mix(in srgb, var(--text-primary) 12%, transparent)'
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
