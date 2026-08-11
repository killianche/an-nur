/**
 * TabBar — нижняя панель с разделами приложения.
 *
 * Показывается только на корневых экранах.  Чтение суры, закладки и
 * лента азкаров открываются «поверх» и панель прячут — там свой
 * плавающий хедер с кнопкой назад, и две панели одновременно
 * конкурировали бы за нижний край с плеером (BottomDock).
 *
 * В QuranIng разделов было два и они жили горизонтальной слайд-парой
 * (контейнер шириной 200% с translateX).  С четырьмя разделами такой
 * приём разваливается: пришлось бы держать смонтированными все
 * четыре экрана и тащить контейнер на 400%.  Панель вкладок
 * привычнее и дешевле — активный экран один.
 *
 * Safe-area: панель поднята на env(safe-area-inset-bottom), чтобы на
 * iPhone с домашним индикатором подписи не уезжали под него.
 */

import type { ReactNode } from 'react';
import { BookOpen, Sparkle, Clock, Compass, Bookmark } from './icons';

export type TabId = 'quran' | 'azkar' | 'dua' | 'prayer' | 'qibla';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'quran',  label: 'Коран',  icon: <BookOpen size={21} /> },
  { id: 'azkar',  label: 'Азкары', icon: <Sparkle size={21} />  },
  { id: 'dua',    label: 'Дуа',    icon: <Bookmark size={21} /> },
  { id: 'prayer', label: 'Намаз',  icon: <Clock size={21} />    },
  { id: 'qibla',  label: 'Кибла',  icon: <Compass size={21} />  },
];

/** Высота панели без safe-area.  Экраны отводят под неё нижний
 *  отступ — экспортируем, чтобы значение не разъезжалось по файлам. */
export const TAB_BAR_HEIGHT = 60;

export function TabBar({ active, onSelect }: {
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <nav
      aria-label="Разделы"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        display: 'grid',
        gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
        height: `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
        borderTop: '1px solid var(--hairline)',
        backdropFilter: 'saturate(160%) blur(20px)',
        WebkitBackdropFilter: 'saturate(160%) blur(20px)',
      }}
    >
      {TABS.map(t => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-current={on ? 'page' : undefined}
            aria-label={t.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              // Активная вкладка — полная непрозрачность и вес 600.
              // Цветом не подсвечиваем: акцентного цвета в палитре нет,
              // а вводить его ради панели значило бы завести четвёртую
              // сущность в теме.
              color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
              transition: 'color 160ms ease',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {t.icon}
            <span style={{
              fontSize: '10.5px',
              fontWeight: on ? 600 : 500,
              letterSpacing: '0.01em',
              lineHeight: 1,
            }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
