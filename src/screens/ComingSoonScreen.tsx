/**
 * ComingSoonScreen — общий каркас для разделов, которые ещё не
 * реализованы: «Намаз» и «Кибла».
 *
 * Зачем ставить заглушки сейчас, а не добавлять вкладки потом:
 * панель вкладок с двумя пунктами и панель с четырьмя — это разная
 * вёрстка, разные отступы у экранов и разное поведение системной
 * кнопки «назад».  Дешевле заложить конечную форму навигации сразу,
 * чем переделывать её вместе с самими фичами.
 *
 * Экран честно говорит, что раздела ещё нет, и перечисляет, что в нём
 * будет, — пустая страница без объяснений читается как баг.
 */

import type { ReactNode } from 'react';
import { TAB_BAR_HEIGHT } from '../components/TabBar';

export function ComingSoonScreen({
  title, icon, lead, points,
}: {
  title: string;
  icon: ReactNode;
  /** Одна фраза о сути раздела. */
  lead: string;
  /** Что появится — короткие пункты, без обещаний по срокам. */
  points: string[];
}) {
  return (
    <div style={{
      minHeight: '100dvh',
      maxWidth: 'min(100%, 760px)',
      margin: '0 auto',
      padding: `0 16px calc(${TAB_BAR_HEIGHT}px + 32px + env(safe-area-inset-bottom))`,
      position: 'relative',
      zIndex: 1,
    }}>
      <header style={{ paddingTop: '64px', paddingBottom: '32px' }}>
        <h1
          className="display-serif"
          style={{
            margin: 0,
            fontSize: 'clamp(44px, 12vw, 88px)',
            fontWeight: 300,
            letterSpacing: '-0.04em',
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          {title}
        </h1>
      </header>

      <section style={{
        border: '1px solid var(--hairline)',
        borderRadius: '18px',
        background: 'color-mix(in srgb, var(--ink) 3%, transparent)',
        padding: '28px 22px',
        display: 'grid',
        gap: '18px',
        justifyItems: 'center',
        textAlign: 'center',
      }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            border: '1px solid var(--hairline-strong)',
            color: 'var(--text-tertiary)',
          }}
        >
          {icon}
        </span>

        <div style={{ display: 'grid', gap: '8px' }}>
          <p style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            lineHeight: 1.45,
          }}>
            Скоро
          </p>
          <p style={{
            margin: 0,
            fontSize: '13.5px',
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            maxWidth: '38ch',
          }}>
            {lead}
          </p>
        </div>

        <ul style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'grid',
          gap: '8px',
          justifyItems: 'start',
          textAlign: 'left',
          width: '100%',
          maxWidth: '38ch',
        }}>
          {points.map(p => (
            <li
              key={p}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '10px',
                alignItems: 'start',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              <span aria-hidden style={{
                marginTop: '7px',
                width: '4px',
                height: '4px',
                borderRadius: '50%',
                background: 'var(--text-tertiary)',
              }} />
              {p}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
