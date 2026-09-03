/**
 * DocumentScreen — юридический документ внутри приложения.
 *
 * ── Почему iframe, а не ссылка в браузер ──────────────────────────────
 *
 * Документы лежат в пакете (`public/privacy.html`, `public/terms.html`),
 * поэтому открываются офлайн — в самолёте и в горах, как и всё
 * остальное.  Ссылка наружу требовала бы интернета и публичного адреса,
 * которого у проекта пока нет.
 *
 * iframe, а не вставка разметки в наш DOM: у документов своя типографика
 * и свои стили, и они должны остаться такими, какие есть.  Юридический
 * текст — не место для наших тем: он выглядит документом, и это
 * правильно.
 *
 * ── Зачем это Apple ───────────────────────────────────────────────────
 *
 * App Review требует, чтобы политика конфиденциальности была доступна.
 * Публичный URL для App Store Connect всё равно понадобится отдельно, но
 * доступность из самого приложения — то, что проверяют глазами.
 *
 * ── Типографика ───────────────────────────────────────────────────────
 *
 * Заголовок набран той же формой, что «Коран» и «Аккаунт»:
 * clamp(30px, 8vw, 40px) по серифу.  Раньше здесь стояла своя,
 * третья по счёту форма — clamp(22px, 6vw, 28px), — и переход из
 * «Аккаунта» в документ выглядел как переход в другое приложение.
 * Строка одна, с многоточием: «Политика конфиденциальности» в шапку не
 * влезает ни при каком кегле, поэтому в DOCS лежат короткие имена.
 */

import { ChevronLeft, ICON_SIZE } from '../components/icons';

export type DocumentId = 'privacy' | 'terms';

const DOCS: Record<DocumentId, { title: string; src: string }> = {
  privacy: { title: 'Конфиденциальность', src: '/privacy.html' },
  terms:   { title: 'Условия',            src: '/terms.html' },
};

export function DocumentScreen({ doc, onBack }: {
  doc: DocumentId;
  onBack: () => void;
}) {
  const meta = DOCS[doc];

  return (
    <div style={{
      height: '100dvh',
      display: 'flex', flexDirection: 'column',
      background: 'transparent',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-snug)',
        padding: 'calc(env(safe-area-inset-top) + var(--space-margin)) var(--space-margin) var(--space-cozy)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          aria-label="Назад"
          className="icon-btn"
          style={{
            width: '42px', height: '42px', flexShrink: 0,
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--hairline)',
            background: 'rgb(var(--ink-rgb) / 0.04)',
            color: 'var(--text-secondary)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronLeft size={ICON_SIZE.md} />
        </button>
        <h1 className="display-serif" style={{
          margin: 0, flex: 1, minWidth: 0,
          fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 'var(--weight-regular)',
          letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.05,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta.title}
        </h1>
      </header>

      <iframe
        src={meta.src}
        title={meta.title}
        style={{
          flex: 1, minHeight: 0, width: '100%',
          border: 'none',
          borderTop: '1px solid var(--hairline)',
          background: '#fafafa',
        }}
      />
    </div>
  );
}
