/**
 * MushafScreen — чтение мусхафа страницами, только арабский.
 *
 * Отдельный режим, а не вариант ленты аятов.  В ленте главное — аят с
 * переводом, экран листается вниз, и текст свёрстан так, как удобно
 * экрану.  Здесь главное — страница мединского мусхафа ровно такая,
 * какая она в печатном издании: пятнадцать строк, та же разбивка слов
 * по строкам, тот же порядок.  Человек, который учит наизусть, держит в
 * памяти картинку страницы, и любая пересборка вёрстки эту картинку
 * ломает.
 *
 * ── Что здесь принципиально ───────────────────────────────────────────
 *
 * Страница видна целиком и не прокручивается.  Прокрутка внутри
 * страницы означала бы, что «полной страницы» нет, а есть кусок.
 * Кегль подбирается под экран — см. components/QcfMushafPage.tsx.
 *
 * Листание — справа налево, как в печатной книге: палец идёт вправо —
 * приходит следующая страница.  Это не мелочь: у того, кто читает
 * мусхаф, направление зашито в моторику.
 *
 * ── Тап по аяту ───────────────────────────────────────────────────────
 *
 * Без него режим был бы тупиком: встретил незнакомое место — и выходи
 * из режима, ищи в ленте.  Тап поднимает лист с ссылкой, переводом
 * Кулиева и кнопкой воспроизведения.  Перевод — не часть страницы, он
 * appears поверх и по требованию, поэтому «чистый арабский» остаётся
 * чистым.
 *
 * ── Чего здесь нет ────────────────────────────────────────────────────
 *
 * Настроек шрифта: кегль диктует страница, а не человек.  Выбора
 * начертания: мусхаф — это конкретное издание, «другой шрифт» означал
 * бы другую разбивку строк и другую страницу.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Appearance, BookOpen, ChevronLeft, ChevronRight, Close, Play, Pause } from '../components/icons';
import { QcfMushafPage } from '../components/QcfMushafPage';
import { FontErrorBanner } from '../components/FontErrorBanner';
import { ScreenHeader, screenHeaderOffset } from '../components/ScreenHeader';
import { ThemeSettings } from '../components/ReadingSettings';
import { QURAN_SOURCES } from '../content/quran-sources';
import { SURAH_BY_NUMBER } from '../content/surahs';
import { useAyahAudio } from '../hooks/useAyahAudio';
import { preloadPage, useQcfPage, getPageSync } from '../hooks/useQcfPage';
import { preloadQcfFonts } from '../hooks/useQcfFont';
import { distinctFontRefs } from '../lib/qcf4';
import type { Theme } from '../hooks/useTheme';
import { juzOfPage, surahAyahOfPage } from '../lib/mushafPages';
import { RECITERS, DEFAULT_RECITER, type ReciterId } from '../lib/reciters';
import { readPref } from '../lib/typography';

export const MUSHAF_FIRST_PAGE = 1;
export const MUSHAF_LAST_PAGE = 604;

type Props = {
  initialPage: number;
  onBack: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  /**
   * Уйти в ленту аятов на том же месте.
   *
   * Кнопка книги работает переключателем: в ленте она уводит на страницу
   * мусхафа, здесь — возвращает к тому же аяту с переводом.  Раньше назад
   * вела только кнопка «Назад», и это читалось как выход, а не как смена
   * вида одного и того же текста.
   */
  onOpenFeed?: (surah: number, ayah: number) => void;
};

const PAGE_KEY = 'mushaf.page';

/** Запомненная страница — чтобы режим открывался там, где закрыли. */
export function readMushafPage(): number {
  if (typeof window === 'undefined') return MUSHAF_FIRST_PAGE;
  const n = parseInt(localStorage.getItem(PAGE_KEY) ?? '', 10);
  return Number.isFinite(n) && n >= MUSHAF_FIRST_PAGE && n <= MUSHAF_LAST_PAGE
    ? n : MUSHAF_FIRST_PAGE;
}

export function MushafScreen({ initialPage, onBack, theme, setTheme, onOpenFeed }: Props) {
  const [page, setPageS] = useState(() => clampPage(initialPage));
  const [selected, setSelected] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  // Чтец — тот же, что выбран в ленте: настройка одна на приложение,
  // и переключаться между режимами ради него было бы странно.
  const audio = useAyahAudio(
    readPref<ReciterId>('reciter', DEFAULT_RECITER, RECITERS.map(r => r.id)),
  );
  const { data, loading, error } = useQcfPage(page);

  const setPage = useCallback((n: number) => {
    const next = clampPage(n);
    setPageS(next);
    setSelected(null);
    localStorage.setItem(PAGE_KEY, String(next));
  }, []);

  // Соседние страницы подгружаем заранее: листание должно быть
  // мгновенным, а json страницы — единицы килобайт.
  //
  // Вместе с json тянем и шрифты этих страниц.  После нарезки по
  // страницам это около 70 КБ на страницу — незаметно в фоне, зато
  // перелистывание открывает готовый текст, без скелета.
  useEffect(() => {
    const neighbours = [
      page + 1 <= MUSHAF_LAST_PAGE ? page + 1 : null,
      page - 1 >= MUSHAF_FIRST_PAGE ? page - 1 : null,
    ];
    for (const n of neighbours) {
      preloadPage(n);
      if (n == null) continue;
      // Шрифты просим только когда json уже разобран: до этого неизвестно,
      // какие подмножества нужны странице.
      const known = getPageSync(n);
      if (known) {
        preloadQcfFonts(distinctFontRefs(known.lines.flatMap(l => l.words)));
      }
    }
  }, [page, data]);

  // Клавиатура: стрелки листают. Влево — следующая страница, потому что
  // книга арабская и «вперёд» здесь физически налево.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setPage(page + 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPage(page - 1); }
      if (e.key === 'Escape' && selected) setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, selected, setPage]);

  // ── Место под страницу ──────────────────────────────────────────────
  // Меряем реально доступный прямоугольник, а не считаем по формуле:
  // на разных телефонах шапка, вырез и «дом-бар» дают разный остаток.
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setArea({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Свайп ───────────────────────────────────────────────────────────
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Порог 48 px и требование «горизонтальнее вертикального» — чтобы
    // случайное движение пальцем при чтении не перелистнуло страницу.
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setPage(dx > 0 ? page + 1 : page - 1);
  };

  const surahsHere = data?.surahs ?? [];
  const title = surahsHere.length
    ? surahsHere.map(s => SURAH_BY_NUMBER[s.id]?.transliteration ?? s.name).join(' · ')
    : `Страница ${page}`;

  const src = selected ? QURAN_SOURCES[selected] : null;
  const playingSelected = !!selected && audio.activeKey === selected
    && (audio.audioState === 'playing' || audio.audioState === 'loading');

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      background: 'transparent',
    }}>
      <ScreenHeader
        title={title}
        subtitle={`Страница ${page} · Джуз ${juzOfPage(page)}`}
        onBack={onBack}
        actions={[
          ...(onOpenFeed ? [{
            key: 'feed',
            label: 'Вернуться к ленте с переводом',
            icon: <BookOpen size={20} />,
            onClick: () => {
              const { surah, ayah } = surahAyahOfPage(page);
              onOpenFeed(surah, ayah);
            },
          }] : []),
          {
            key: 'jump',
            label: 'Перейти к странице',
            icon: <span style={{
              fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
            }}>{page}</span>,
            active: jumpOpen,
            onClick: () => { setJumpOpen(v => !v); setThemeOpen(false); },
          },
          {
            key: 'theme',
            label: 'Оформление',
            icon: <Appearance size={20} />,
            active: themeOpen,
            ref: themeBtnRef,
            onClick: () => { setThemeOpen(v => !v); setJumpOpen(false); },
          },
        ]}
      />

      {themeOpen && (
        <ThemeSettings
          theme={theme} setTheme={setTheme}
          onClose={() => setThemeOpen(false)}
          anchorEl={themeBtnRef.current}
        />
      )}

      {jumpOpen && (
        <PageJump
          current={page}
          onPick={n => { setPage(n); setJumpOpen(false); }}
          onClose={() => setJumpOpen(false)}
        />
      )}

      {/* ── Страница ─────────────────────────────────────────────────── */}
      <div
        ref={areaRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Панель фиксированная и места в потоке не занимает, поэтому
          // отступ сверху отводим руками — иначе первая строка уезжает
          // под неё. screenHeaderOffset уже учитывает «чёлку».
          paddingTop: screenHeaderOffset(6),
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)',
          position: 'relative',
        }}
      >
        {error && (
          <p style={{
            padding: '0 24px', textAlign: 'center',
            fontSize: '13.5px', lineHeight: 1.6, color: 'var(--text-tertiary)',
          }}>
            Не удалось загрузить страницу {page}.<br />{error}
          </p>
        )}

        {!error && !data && loading && (
          <div style={{ width: '100%', padding: `0 ${20}px` }} aria-hidden>
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className="skeleton"
                style={{
                  height: '18px', borderRadius: '4px',
                  margin: '0 auto 14px',
                  // Строки мусхафа выровнены по обоим краям, кроме
                  // последней в суре — заглушка это повторяет, чтобы при
                  // подмене ничего не прыгнуло.
                  width: i % 7 === 6 ? '55%' : '100%',
                }}
              />
            ))}
          </div>
        )}

        {/* Плашка о неприехавшем шрифте — поверх страницы, потому что
            сама страница в этот момент показывает только заготовки строк
            и без объяснения выглядит сломанной. */}
        <div style={{ position: 'absolute', top: 0, left: 12, right: 12, zIndex: 2 }}>
          <FontErrorBanner />
        </div>

        {!error && data && (
          <QcfMushafPage
            pageData={data}
            fitTo={area}
            activeVerseKey={audio.activeKey}
            activeWordPos={audio.currentWordPos}
            selectedVerseKey={selected}
            onAyahTap={setSelected}
          />
        )}

        {/* Зоны листания по краям — для тех, кто читает одной рукой и
            не любит свайп.  Узкие и прозрачные, чтобы не мешать тапу
            по аяту в теле страницы. */}
        <EdgeTap side="right" disabled={page <= MUSHAF_FIRST_PAGE} onTap={() => setPage(page - 1)} />
        <EdgeTap side="left"  disabled={page >= MUSHAF_LAST_PAGE}  onTap={() => setPage(page + 1)} />
      </div>

      {/* ── Лист выбранного аята ─────────────────────────────────────── */}
      {selected && (
        <AyahSheet
          verseKey={selected}
          translation={src?.translations.ru ?? null}
          playing={playingSelected}
          onPlay={() => {
            const [s, a] = selected.split(':').map(Number);
            if (playingSelected) audio.pause();
            else audio.playFrom(s, a, SURAH_BY_NUMBER[s]?.ayahs ?? a);
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function clampPage(n: number): number {
  if (!Number.isFinite(n)) return MUSHAF_FIRST_PAGE;
  return Math.min(MUSHAF_LAST_PAGE, Math.max(MUSHAF_FIRST_PAGE, Math.round(n)));
}

/** Прозрачная полоса у края экрана: тап листает. */
function EdgeTap({ side, disabled, onTap }: {
  side: 'left' | 'right';
  disabled: boolean;
  onTap: () => void;
}) {
  if (disabled) return null;
  return (
    <button
      onClick={onTap}
      aria-label={side === 'left' ? 'Следующая страница' : 'Предыдущая страница'}
      style={{
        position: 'absolute', top: 0, bottom: 0, [side]: 0,
        width: '11%', minWidth: '34px',
        border: 'none', background: 'transparent',
        cursor: 'pointer', padding: 0,
        WebkitTapHighlightColor: 'transparent',
      }}
    />
  );
}

/**
 * Лист с переводом выбранного аята.
 *
 * Половина экрана и не больше: под ним должна оставаться видна та самая
 * строка мусхафа, ради которой лист и открыли.
 */
function AyahSheet({ verseKey, translation, playing, onPlay, onClose }: {
  verseKey: string;
  translation: string | null;
  playing: boolean;
  onPlay: () => void;
  onClose: () => void;
}) {
  const [surah, ayah] = verseKey.split(':').map(Number);
  const meta = SURAH_BY_NUMBER[surah];

  return (
    <div
      role="dialog"
      aria-label={`Аят ${verseKey}`}
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 45,
        maxHeight: '50%',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface)',
        borderTop: '1px solid var(--hairline)',
        borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.28)',
        padding: '14px 18px calc(env(safe-area-inset-bottom) + 16px)',
        animation: 'sheet-up 0.22s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px',
      }}>
        <span style={{
          fontSize: '12px', fontWeight: 600, letterSpacing: '0.02em',
          padding: '4px 9px', borderRadius: '9999px',
          border: '1px solid var(--hairline)',
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>
          {verseKey}
        </span>
        <span style={{
          flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {meta?.transliteration ?? `Сура ${surah}`} · аят {ayah}
        </span>

        <button
          onClick={onPlay}
          aria-label={playing ? 'Пауза' : 'Слушать аят'}
          className="icon-btn"
          style={{
            width: '38px', height: '38px', flexShrink: 0, borderRadius: '9999px',
            border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="icon-btn"
          style={{
            width: '38px', height: '38px', flexShrink: 0, borderRadius: '9999px',
            border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
            color: 'var(--text-secondary)',
          }}
        >
          <Close size={16} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {translation ? (
          <p style={{
            margin: 0, fontSize: '15px', lineHeight: 1.65,
            color: 'var(--text-primary)',
          }}>
            {translation}
          </p>
        ) : (
          <p style={{
            margin: 0, fontSize: '13.5px', lineHeight: 1.6,
            color: 'var(--text-tertiary)',
          }}>
            Перевод этого аята не найден в данных приложения.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Переход к странице.  Ввод номера, а не список из 604 пунктов:
 * страницу мусхафа помнят числом.
 */
function PageJump({ current, onPick, onClose }: {
  current: number;
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(String(current));
  const n = parseInt(value, 10);
  const valid = Number.isFinite(n) && n >= MUSHAF_FIRST_PAGE && n <= MUSHAF_LAST_PAGE;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 44 }}
      />
      <div style={{
        position: 'absolute', top: 'calc(env(safe-area-inset-top) + 58px)',
        right: '12px', zIndex: 45, width: 'min(260px, calc(100vw - 24px))',
        padding: '14px',
        borderRadius: '14px',
        border: '1px solid var(--hairline)',
        background: 'var(--surface)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
      }}>
        <p style={{
          margin: '0 0 9px', fontSize: '10px', fontWeight: 600,
          letterSpacing: '0.10em', textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}>
          Страница 1–604
        </p>
        <form
          onSubmit={e => { e.preventDefault(); if (valid) onPick(n); }}
          style={{ display: 'flex', gap: '8px' }}
        >
          <input
            autoFocus
            inputMode="numeric"
            value={value}
            onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 3))}
            aria-label="Номер страницы"
            style={{
              flex: 1, minWidth: 0, height: '40px', padding: '0 12px',
              borderRadius: '10px', border: '1px solid var(--hairline)',
              background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
              color: 'var(--text-primary)', fontSize: '15px',
              fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
            }}
          />
          <button
            type="submit"
            disabled={!valid}
            style={{
              height: '40px', padding: '0 14px', borderRadius: '10px',
              border: '1px solid var(--hairline)',
              background: valid
                ? 'color-mix(in srgb, var(--ink) 10%, transparent)'
                : 'transparent',
              color: valid ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontFamily: 'inherit', fontSize: '14px',
              cursor: valid ? 'pointer' : 'default',
            }}
          >
            Перейти
          </button>
        </form>

        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <StepButton label="Назад" icon={<ChevronRight size={16} />}
            disabled={current <= MUSHAF_FIRST_PAGE} onClick={() => onPick(current - 1)} />
          <StepButton label="Вперёд" icon={<ChevronLeft size={16} />}
            disabled={current >= MUSHAF_LAST_PAGE} onClick={() => onPick(current + 1)} />
        </div>
      </div>
    </>
  );
}

function StepButton({ label, icon, disabled, onClick }: {
  label: string; icon: React.ReactNode; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, height: '36px', borderRadius: '10px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        border: '1px solid var(--hairline)',
        background: 'transparent',
        color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
        fontFamily: 'inherit', fontSize: '13px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}{label}
    </button>
  );
}
