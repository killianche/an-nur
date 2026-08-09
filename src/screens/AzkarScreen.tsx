import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../hooks/useTheme';
import { Palette } from '../components/icons';
import { ThemeSettings } from '../components/ReadingSettings';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { loadAzkarData, type AzkarCategoryId, type AzkarData } from '../lib/azkar';

type Props = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  // onBack убран: возврат к Корану — это переключение вкладки в
  // нижней панели, отдельная ссылка в шапке была бы вторым путём.
  onOpenCategory: (category: AzkarCategoryId) => void;
};

/**
 * Azkar index — заголовок + две большие карточки категорий
 * (Утренние / Вечерние).  Визуальный язык повторяет SurahPicker, чтобы
 * переключение вкладок читалось как одна поверхность, а не как два
 * разных приложения.
 *
 * Order shown to the user is `categories[]` from azkar.json, filtered to
 * those with at least one entry. "intro" is hidden until it has content.
 */
export function AzkarScreen({ theme, setTheme, onOpenCategory }: Props) {
  const [data, setData] = useState<AzkarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    loadAzkarData()
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(e?.message ?? String(e)); });
    return () => { alive = false; };
  }, []);

  // Categories with at least one entry, in the source-defined order.
  const visibleCats = (data?.categories ?? []).filter(
    c => (data?.by_category[c.id] ?? 0) > 0,
  );

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'transparent',
      maxWidth: 'min(100%, 760px)',
      margin: '0 auto',
      // Нижний отступ учитывает панель вкладок.
      padding: `0 16px calc(${TAB_BAR_HEIGHT}px + 36px + env(safe-area-inset-bottom))`,
      position: 'relative',
    }}>
      {themeOpen && (
        <ThemeSettings
          theme={theme}
          setTheme={setTheme}
          onClose={() => setThemeOpen(false)}
          anchorEl={themeBtnRef.current}
        />
      )}

      {/* ── Title row — как в SurahPicker: крупный вордмарк справа */}
      <header style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'flex-end',
        gap: '16px',
        paddingTop: '64px',
        paddingBottom: '32px',
        position: 'relative',
        zIndex: 1,
      }}>
        <h1
          className="display-serif"
          style={{
            margin: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: 'clamp(44px, 12vw, 88px)',
            fontWeight: 300,
            letterSpacing: '-0.04em',
            color: 'var(--text-primary)',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          Azkar
        </h1>
      </header>

      {/* ── Theme button — pinned right of the title, like SurahPicker's */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '24px',
        position: 'relative',
        zIndex: 1,
      }}>
        <button
          ref={themeBtnRef}
          onClick={() => setThemeOpen(true)}
          aria-label="Theme settings"
          className="icon-btn"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Palette size={20} />
        </button>
      </div>

      {/* ── States: loading / error / data ─────────────────────────────── */}
      {!data && !error && <CategorySkeleton />}

      {error && (
        <div style={{
          textAlign: 'center', padding: '60px 16px',
          fontSize: '14px', color: 'var(--text-tertiary)',
        }}>
          Не удалось загрузить азкары<br />
          <span style={{ fontSize: '12px', opacity: 0.7 }}>{error}</span>
        </div>
      )}

      {data && visibleCats.length > 0 && (
        <>
          <section
            style={{
              display: 'grid',
              gap: '14px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {visibleCats.map(cat => (
              <CategoryCard
                key={cat.id}
                id={cat.id}
                titleRu={cat.title_ru}
                count={data.by_category[cat.id] ?? 0}
                onClick={() => onOpenCategory(cat.id)}
              />
            ))}
          </section>

        </>
      )}

      {data && visibleCats.length === 0 && (
        <p style={{
          textAlign: 'center', padding: '64px 0',
          color: 'var(--text-tertiary)', fontSize: '14px',
        }}>
          Пока нет азкаров.
        </p>
      )}
    </div>
  );
}

/** Feature category card — "Утренние" / "Вечерние" entry buttons.
 *  Visual language mirrors the "Continue Reading" recents card in
 *  SurahPicker: flat surface, hairline border, no shadow, no ornament.
 *  Three-row stack — uppercase eyebrow, display-serif title, small
 *  meta line with the azkar count.
 *
 *  В QuranIng крупным заголовком шло ингушское название, а русское
 *  было надстрочной подписью.  Здесь ингушского нет, поэтому русское
 *  название поднято в заголовок, а eyebrow стал нейтральным «АЗКАРЫ». */
function CategoryCard({
  id, titleRu, count, onClick,
}: {
  id: AzkarCategoryId;
  titleRu: string;
  count: number;
  onClick: () => void;
}) {
  // `title_ru` из azkar.json — «Утренние азкары» / «Вечерние азкары».
  // Фолбэк на случай, если категория придёт без названия.
  const title = titleRu || (id === 'morning' ? 'Утренние азкары' : 'Вечерние азкары');
  const eyebrow = 'Азкары';

  // Russian count pluralisation for "азкар".
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    (lastTwo >= 11 && lastTwo <= 14) ? 'азкаров'
    : last === 1 ? 'азкар'
    : last >= 2 && last <= 4 ? 'азкара'
    : 'азкаров';

  // Press-effect state — light squish, no brightness change to match
  // the quieter visual weight of the recents-card style.
  const [pressed, setPressed] = useState(false);
  const release = () => setPressed(false);

  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      style={{
        display: 'block',
        width: '100%',
        padding: '20px 22px 18px',
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: '18px',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'inherit',
        transform: pressed ? 'scale(0.985)' : 'scale(1)',
        transition: 'transform 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'transform',
      }}
    >
      <div style={{
        fontSize: '10.5px',
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}>
        {eyebrow}
      </div>
      <div
        className="display-serif"
        style={{
          marginTop: '10px',
          fontSize: 'clamp(24px, 5.8vw, 28px)',
          color: 'var(--text-primary)',
          fontWeight: 400,
          letterSpacing: '-0.015em',
          lineHeight: 1.15,
        }}
      >
        {title}
      </div>
      <div style={{
        marginTop: '12px',
        fontSize: '12px',
        fontWeight: 500,
        letterSpacing: '0.005em',
        color: 'var(--text-secondary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {count} {noun}
      </div>
    </button>
  );
}

/** Skeleton placeholder while azkar.json loads. */
function CategorySkeleton() {
  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: '140px',
            borderRadius: '22px',
          }}
        />
      ))}
    </div>
  );
}
