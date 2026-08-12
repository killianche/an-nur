/**
 * TabBar — нижняя панель с разделами приложения.
 *
 * Показывается только на корневых экранах.  Чтение суры, закладки,
 * лента азкаров, мусхаф и кибла открываются «поверх» и панель прячут —
 * там своя кнопка назад, и две панели одновременно конкурировали бы за
 * нижний край с плеером (BottomDock).
 *
 * Кибла из вкладок ушла по решению владельца: её открывают редко, а
 * вход в неё логичнее там, где человек уже думает о молитве — на экране
 * намаза.  Освободившееся место занял «Аккаунт».
 *
 * ── Почему плавающая капсула, а не панель во всю ширину ────────────────
 *
 * Так это сделано в iOS 26: панель не прибита к краям, а лежит на экране
 * отдельным островом из полупрозрачного стекла.  Разница не косметическая
 * — сквозь стекло видно, что список под ним продолжается, и нижний край
 * экрана перестаёт читаться как «конец страницы».
 *
 * Что делает стекло стеклом, кроме размытия:
 *   • светлая кромка в один пиксель — блик на скруглении;
 *   • внутренний блик сверху — свет падает с этой стороны;
 *   • мягкая широкая тень — остров приподнят над содержимым.
 *
 * Кромка и блик берутся от `--text-primary`, а не заданы своим цветом:
 * в тёмных темах он светлый и даёт светлую кромку, в светлых — наоборот.
 * Одно выражение работает во всех пяти темах, включая «Бумагу».
 *
 * ── Активная вкладка ──────────────────────────────────────────────────
 *
 * Подложка-пилюля одна на всю панель и переезжает между вкладками, а не
 * появляется на месте.  Так видно, что раздел сменился, — переезд связывает
 * старое положение с новым; появление и исчезновение этой связи не дают.
 *
 * Цветом активную вкладку не подсвечиваем: акцентного цвета в палитре нет,
 * а вводить его ради панели значило бы завести в теме ещё одну сущность.
 * Хватает подложки и полной непрозрачности чернил.
 *
 * Safe-area: капсула поднята над домашним индикатором, а не подложена под
 * него — плавающему острову нужен зазор с обеих сторон.
 */

import type { ReactNode } from 'react';
import { BookOpen, Sparkle, Clock, Flower, Person } from './icons';

export type TabId = 'quran' | 'azkar' | 'dua' | 'prayer' | 'account';

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'quran',  label: 'Коран',  icon: <BookOpen size={20} /> },
  { id: 'azkar',  label: 'Азкары', icon: <Sparkle size={20} />  },
  { id: 'dua',    label: 'Дуа',    icon: <Flower size={20} />   },
  { id: 'prayer', label: 'Намаз',  icon: <Clock size={20} />    },
  { id: 'account', label: 'Аккаунт', icon: <Person size={20} /> },
];

/** Высота самой капсулы. */
const CAPSULE_HEIGHT = 58;
/** Зазор между капсулой и нижним краем (или домашним индикатором). */
const CAPSULE_GAP = 10;
/** Отступ капсулы от боковых краёв экрана. */
const SIDE_INSET = 12;

/**
 * Сколько места панель занимает у нижнего края.  Экраны отводят под неё
 * нижний отступ — экспортируем, чтобы значение не разъезжалось по файлам.
 * Считается вместе с зазором: под капсулой ничего не должно застревать.
 */
export const TAB_BAR_HEIGHT = CAPSULE_HEIGHT + CAPSULE_GAP;

export function TabBar({ active, onSelect }: {
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  const index = Math.max(0, TABS.findIndex(t => t.id === active));

  return (
    <>
      {/* Туман под капсулой.
          Панель висит с зазором от края, и в эту щель попадает содержимое
          списка — строка, разрезанная пополам, читается как недоделка.
          Полоса размывает то, что уходит под панель, и сходит на нет к
          верху: капсула получает чистое поле, а список не обрывается.

          Размытие, а не заливка цветом фона: на теме «Мусхаф» фоном лежит
          фотография бумаги, и любая одноцветная полоса спорила бы с её
          текстурой. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: `calc(env(safe-area-inset-bottom) + ${TAB_BAR_HEIGHT + 14}px)`,
          zIndex: 39,
          pointerEvents: 'none',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 55%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 55%)',
        }}
      />

    <nav
      aria-label="Разделы"
      style={{
        position: 'fixed',
        left: `${SIDE_INSET}px`,
        right: `${SIDE_INSET}px`,
        bottom: `calc(env(safe-area-inset-bottom) + ${CAPSULE_GAP}px)`,
        zIndex: 40,
        height: `${CAPSULE_HEIGHT}px`,
        borderRadius: '9999px',
        // Стекло: сквозь него должно быть видно содержимое, но подписи
        // обязаны читаться на любом фоне — отсюда и размытие, и заметная
        // подложка, и повышенная насыщенность (иначе цвета под стеклом
        // выцветают в серость).
        background: 'color-mix(in srgb, var(--surface) 68%, transparent)',
        backdropFilter: 'saturate(180%) blur(28px)',
        WebkitBackdropFilter: 'saturate(180%) blur(28px)',
        border: '1px solid color-mix(in srgb, var(--text-primary) 10%, transparent)',
        boxShadow: [
          // Блик по верхней кромке — свет падает сверху.
          'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 12%, transparent)',
          // Остров приподнят: тень широкая и мягкая, без чёткого края.
          '0 10px 34px color-mix(in srgb, var(--ink) 22%, transparent)',
          '0 2px 8px color-mix(in srgb, var(--ink) 12%, transparent)',
        ].join(', '),
        overflow: 'hidden',
      }}
    >
      {/* Подложка активной вкладки.  Одна на панель: переезжает, а не
          возникает заново — переезд показывает, откуда и куда ушёл фокус. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '5px',
          bottom: '5px',
          left: '4px',
          width: `calc((100% - 8px) / ${TABS.length})`,
          transform: `translateX(calc(${index} * 100%))`,
          borderRadius: '9999px',
          // Пилюля — «стекло на стекле»: своя подложка, своя кромка и свой
          // блик.  Одной подложкой она читалась как пятно грязи на панели;
          // кромка возвращает ей объём и отделяет от фона капсулы.
          background: 'color-mix(in srgb, var(--text-primary) 14%, transparent)',
          border: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
          boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 10%, transparent)',
          transition: 'transform 340ms cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: 'none',
        }}
      />

      <div style={{
        position: 'relative',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
      }}>
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
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
                transition: 'color 200ms ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {t.icon}
              <span style={{
                fontSize: '10px',
                fontWeight: on ? 600 : 500,
                letterSpacing: '0.005em',
                lineHeight: 1,
                // «Аккаунт» — самая длинная подпись; на узком экране она
                // должна сжаться, а не вылезти за пилюлю.
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
    </>
  );
}
