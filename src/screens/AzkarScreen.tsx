/**
 * AzkarScreen — главный экран раздела «Азкары».
 *
 * Шапка — как на главной Корана: то же название раздела тем же кеглем,
 * та же кнопка оформления справа. Переключение вкладки должно читаться
 * как переход внутри одного продукта, а не в другое приложение (раньше
 * тут был вордмарк «Azkar» латиницей высотой до 88 px).
 *
 * А вот список — намеренно НЕ как у сур.
 *
 * У Корана 114 строк, и там строка правильная: помещается много,
 * сканируется за взгляд. Здесь пунктов ровно два, и список из двух
 * строк у самого верха — худшее, что можно сделать на телефоне: экран
 * пустой на девять десятых, а тянуться пальцем надо в самый верх.
 *
 * Поэтому две большие карточки, поделившие свободную высоту и прижатые
 * к НИЗУ экрана — туда, куда большой палец дотягивается не глядя.
 * Промах по такой карточке невозможен.
 *
 * Иконка вместо номера: у категорий нет порядкового номера, которым бы
 * кто-то пользовался. Восход и закат различимы с одного взгляда и сразу
 * говорят, когда это читают.
 *
 * Арабских названий категорий в azkar.json нет, и придумывать их —
 * ровно то, чего нельзя делать с сакральным текстом. Поэтому правая
 * колонка, где у сур стоит арабское начертание, здесь пустая.
 *
 * Порядок категорий — как в azkar.json, показываются только те, где
 * есть хотя бы одна запись («Вступительные» пока пусты и скрыты).
 */

import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../hooks/useTheme';
import { Appearance, Sunrise, Sunset } from '../components/icons';
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

/** Склонение слова «азкар». */
function azkarWord(n: number): string {
  const two = n % 100, one = n % 10;
  if (two >= 11 && two <= 14) return 'азкаров';
  if (one === 1) return 'азкар';
  if (one >= 2 && one <= 4) return 'азкара';
  return 'азкаров';
}

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

  const visibleCats = (data?.categories ?? []).filter(
    c => (data?.by_category[c.id] ?? 0) > 0,
  );

  return (
    <div style={{
      minHeight: '100dvh',
      maxWidth: 'min(100%, 720px)',
      margin: '0 auto',
      padding: `0 16px calc(${TAB_BAR_HEIGHT}px + 28px + env(safe-area-inset-bottom))`,
      position: 'relative',
      zIndex: 1,
      // Колонка на всю высоту: свободное место достаётся карточкам,
      // и они опускаются к нижней кромке.
      display: 'flex',
      flexDirection: 'column',
    }}>
      {themeOpen && (
        <ThemeSettings
          theme={theme}
          setTheme={setTheme}
          onClose={() => setThemeOpen(false)}
          anchorEl={themeBtnRef.current}
        />
      )}

      {/* Шапка — один в один с главной Корана. */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        paddingTop: 'calc(env(safe-area-inset-top) + 18px)',
        paddingBottom: '16px',
      }}>
        <h1
          className="display-serif"
          style={{
            margin: 0, flex: 1, minWidth: 0,
            fontSize: 'clamp(30px, 8vw, 40px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1.05,
          }}
        >
          Азкары
        </h1>

        <button
          ref={themeBtnRef}
          onClick={() => setThemeOpen(v => !v)}
          aria-label="Оформление"
          title="Оформление"
          className="icon-btn"
          data-active={themeOpen}
          style={{
            width: '42px', height: '42px', flexShrink: 0,
            borderRadius: '12px',
            border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
            color: themeOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <Appearance size={19} />
        </button>
      </header>

      {!data && !error && <CategorySkeleton />}

      {error && (
        <div style={{
          textAlign: 'center', padding: '60px 16px',
          fontSize: '14px', color: 'var(--text-tertiary)', lineHeight: 1.6,
        }}>
          Не удалось загрузить азкары<br />
          <span style={{ fontSize: '12px', opacity: 0.7 }}>{error}</span>
        </div>
      )}

      {data && visibleCats.length > 0 && (
        <div style={{
          flex: 1,
          display: 'grid',
          // Строк ровно столько, сколько категорий: две — значит по
          // половине свободной высоты каждой.
          gridTemplateRows: `repeat(${visibleCats.length}, minmax(120px, 1fr))`,
          // Потолок нужен на планшете и в альбомной ориентации: без
          // него карточка растянулась бы на пол-экрана и превратилась
          // в баннер.
          gridAutoRows: 'minmax(120px, 1fr)',
          gap: '14px',
          alignContent: 'end',
          paddingTop: '8px',
        }}>
          {visibleCats.map(cat => (
            <CategoryCard
              key={cat.id}
              id={cat.id}
              title={cat.title_ru || (cat.id === 'morning' ? 'Утренние азкары' : 'Вечерние азкары')}
              count={data.by_category[cat.id] ?? 0}
              onClick={() => onOpenCategory(cat.id)}
            />
          ))}
        </div>
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

/**
 * Крупная карточка категории.
 *
 * Занимает половину свободной высоты — на телефоне это примерно
 * 250–300 px, то есть промахнуться невозможно даже на ходу.  Внутри
 * ничего лишнего: иконка времени суток, название и счётчик.
 *
 * Композиция диагональная: иконка в левом верхнем углу, подпись — в
 * левом нижнем.  Сначала содержимое стояло по центру, и карточка
 * высотой 300 px выглядела пустой: текст висел в середине, а сверху и
 * снизу оставались широкие поля ни с чем.  Разнеся два элемента по
 * углам, мы заполняем ту же площадь, ничего в неё не добавляя.
 */
function CategoryCard({
  id, title, count, onClick,
}: {
  id: AzkarCategoryId;
  title: string;
  count: number;
  onClick: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const release = () => setPressed(false);
  const Icon = id === 'evening' ? Sunset : Sunrise;

  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '18px',
        width: '100%',
        height: '100%',
        padding: '24px 26px',
        borderRadius: '20px',
        border: '1px solid var(--hairline)',
        background: 'var(--surface)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'inherit',
        transform: pressed ? 'scale(0.985)' : 'scale(1)',
        transition: 'transform 180ms cubic-bezier(0.4,0,0.2,1), background 140ms ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: '56px', height: '56px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '9999px',
          background: 'color-mix(in srgb, var(--ink) 6%, transparent)',
          border: '1px solid var(--hairline)',
          color: 'var(--text-secondary)',
        }}
      >
        <Icon size={26} />
      </span>

      <span style={{ minWidth: 0 }}>
        <span
          className="display-serif"
          style={{
            display: 'block',
            fontSize: 'clamp(22px, 6vw, 27px)',
            fontWeight: 400,
            letterSpacing: '-0.015em',
            color: 'var(--text-primary)',
            lineHeight: 1.15,
          }}
        >
          {title}
        </span>
        <span style={{
          display: 'block', marginTop: '7px',
          fontSize: '13px',
          color: 'var(--text-tertiary)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {count} {azkarWord(count)}
        </span>
      </span>
    </button>
  );
}

/** Заглушка на время загрузки azkar.json.  Повторяет и геометрию, и
 *  положение карточек, чтобы при появлении данных ничего не прыгнуло. */
function CategorySkeleton() {
  return (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateRows: 'repeat(2, minmax(120px, 1fr))',
      gap: '14px',
      alignContent: 'end',
      paddingTop: '8px',
    }}>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ borderRadius: '20px' }} />
      ))}
    </div>
  );
}
