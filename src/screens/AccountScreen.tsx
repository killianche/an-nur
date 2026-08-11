/**
 * AccountScreen — раздел «Аккаунт».
 *
 * ── Что это на самом деле ─────────────────────────────────────────────
 *
 * Не аккаунт в привычном смысле: у приложения нет ни сервера, ни входа,
 * и всё, что человек настроил, лежит у него на устройстве.  Экран
 * говорит это прямым текстом — иначе люди будут ждать, что их список
 * дуа переедет на новый телефон, и обидятся, когда не переедет.
 *
 * Настоящий аккаунт со входом и синхронизацией — отдельная большая
 * работа с бэкендом; начинать её без запроса нельзя.
 *
 * ── Зачем раздел нужен для App Store ──────────────────────────────────
 *
 * App Review проверяет несколько вещей, и без них приложение не
 * пропустят:
 *
 *   • политика конфиденциальности должна быть доступна — здесь она
 *     открывается из приложения и работает офлайн;
 *   • условия использования — там же;
 *   • данные о пользователе должны удаляться по его требованию
 *     (Guideline 5.1.1) — кнопка ниже действительно стирает всё, а не
 *     делает вид;
 *   • версия сборки — чтобы поддержка понимала, о чём речь.
 *
 * Чего этот экран закрыть не может, потому что нужны данные владельца:
 * правообладатель, контактный e-mail и публичный URL документов для
 * App Store Connect.  Они перечислены в STATUS.md как блокеры релиза, и
 * подставлять сюда выдуманный e-mail нельзя — он попадёт в магазин.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Appearance, ChevronRight, Document, Person, Trash,
} from '../components/icons';
import { ThemeSettings } from '../components/ReadingSettings';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import type { Theme } from '../hooks/useTheme';
import { THEME_LABELS } from '../hooks/useTheme';
import {
  countLocalData, MAX_NAME_LENGTH, onProfileChange,
  readUserName, wipeLocalData, writeUserName,
} from '../lib/profile';
import type { DocumentId } from './DocumentScreen';

/** Версия из package.json, подставляется при сборке (см. vite.config.ts). */
declare const __APP_VERSION__: string;

type Props = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  onOpenDocument: (doc: DocumentId) => void;
};

export function AccountScreen({ theme, setTheme, onOpenDocument }: Props) {
  const [name, setName] = useState(readUserName);
  const [themeOpen, setThemeOpen] = useState(false);
  const [wipeArmed, setWipeArmed] = useState(false);
  const [wiped, setWiped] = useState<number | null>(null);
  const [stored, setStored] = useState(countLocalData);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => onProfileChange(() => setStored(countLocalData())), []);

  const commitName = (v: string) => {
    setName(v);
    writeUserName(v);
  };

  return (
    <div style={{
      minHeight: '100dvh',
      maxWidth: 'min(100%, 720px)',
      margin: '0 auto',
      padding: `0 16px calc(${TAB_BAR_HEIGHT}px + 28px + env(safe-area-inset-bottom))`,
      position: 'relative',
      zIndex: 1,
    }}>
      {themeOpen && (
        <ThemeSettings
          theme={theme} setTheme={setTheme}
          onClose={() => setThemeOpen(false)}
          anchorEl={themeBtnRef.current}
        />
      )}

      <header style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        paddingTop: 'calc(env(safe-area-inset-top) + 18px)',
        paddingBottom: '18px',
      }}>
        <h1 className="display-serif" style={{
          margin: 0, flex: 1, minWidth: 0,
          fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 400,
          letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.05,
        }}>
          Аккаунт
        </h1>
        <button
          ref={themeBtnRef}
          onClick={() => setThemeOpen(v => !v)}
          aria-label="Оформление" title="Оформление"
          className="icon-btn" data-active={themeOpen}
          style={{
            width: '42px', height: '42px', flexShrink: 0, borderRadius: '12px',
            border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 4%, transparent)',
            color: themeOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <Appearance size={19} />
        </button>
      </header>

      {/* ── Имя ──────────────────────────────────────────────────────── */}
      <Card>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          padding: '16px 16px 14px',
        }}>
          <span style={{
            flexShrink: 0,
            width: '52px', height: '52px', borderRadius: '9999px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--hairline)',
            background: 'color-mix(in srgb, var(--ink) 5%, transparent)',
            color: 'var(--text-secondary)',
          }}>
            <Person size={24} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{
              display: 'block', marginBottom: '5px',
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.10em',
              textTransform: 'uppercase', color: 'var(--text-tertiary)',
            }}>
              Имя
            </label>
            <input
              value={name}
              onChange={e => commitName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Как к вам обращаться"
              aria-label="Имя"
              style={{
                width: '100%', minHeight: '30px',
                border: 'none', background: 'transparent',
                color: 'var(--text-primary)',
                fontFamily: 'inherit', fontSize: '16.5px', fontWeight: 500,
                letterSpacing: '-0.01em', padding: 0,
                outline: 'none',
              }}
            />
          </div>
        </div>
        <Hint>
          Имя хранится только на этом устройстве. Входа и синхронизации в
          приложении нет: ваши списки, закладки и настройки никуда не
          отправляются.
        </Hint>
      </Card>

      {/* ── Оформление ───────────────────────────────────────────────── */}
      <SectionTitle>Настройки</SectionTitle>
      <Card>
        <Row
          label="Оформление"
          value={THEME_LABELS[theme]}
          onClick={() => setThemeOpen(true)}
        />
        <Hint>
          Размер текста и шрифты настраиваются там, где читают: в Коране,
          азкарах и дуа — своей кнопкой в шапке.
        </Hint>
      </Card>

      {/* ── Документы ────────────────────────────────────────────────── */}
      <SectionTitle>Документы</SectionTitle>
      <Card>
        <Row
          icon={<Document size={18} />}
          label="Политика конфиденциальности"
          onClick={() => onOpenDocument('privacy')}
        />
        <Divider />
        <Row
          icon={<Document size={18} />}
          label="Условия использования"
          onClick={() => onOpenDocument('terms')}
        />
        <Hint>Открываются без интернета — документы лежат в приложении.</Hint>
      </Card>

      {/* ── Данные ───────────────────────────────────────────────────── */}
      <SectionTitle>Мои данные</SectionTitle>
      <Card>
        {wiped === null ? (
          <>
            <button
              onClick={() => setWipeArmed(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                width: '100%', minHeight: '50px', padding: '10px 16px',
                border: 'none', background: 'transparent',
                color: 'var(--danger)', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '15px', textAlign: 'left',
              }}
            >
              <Trash size={18} />
              <span style={{ flex: 1 }}>Удалить мои данные</span>
              <span style={{
                fontSize: '13px', color: 'var(--text-tertiary)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {stored}
              </span>
            </button>

            {/*
              Второй шаг, а не диалог: тот же приём, что при удалении дуа.
              Но здесь потеря необратима — вернуть настройки будет нечем,
              поэтому текст говорит это прямо, а не «вы уверены?».
            */}
            {wipeArmed && (
              <div style={{
                padding: '0 16px 14px',
                animation: 'card-in 0.2s ease both',
              }}>
                <p style={{
                  margin: '0 0 12px', fontSize: '13px', lineHeight: 1.55,
                  color: 'var(--text-secondary)',
                }}>
                  Удалятся имя, закладки, история чтения, список и скрытые
                  дуа, города намаза и все настройки текста. Отменить будет
                  нельзя. Скачанное аудио останется — его убирают в
                  настройках чтения.
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { setWiped(wipeLocalData()); setWipeArmed(false); }}
                    style={{
                      flex: 1, minHeight: '44px', borderRadius: '12px',
                      border: 'none', background: 'var(--danger)',
                      color: '#fff', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '14.5px', fontWeight: 600,
                    }}
                  >
                    Удалить
                  </button>
                  <button
                    onClick={() => setWipeArmed(false)}
                    style={{
                      flex: 1, minHeight: '44px', borderRadius: '12px',
                      border: '1px solid var(--hairline)', background: 'transparent',
                      color: 'var(--text-primary)', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '14.5px', fontWeight: 500,
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '16px' }}>
            <p style={{
              margin: 0, fontSize: '14.5px', lineHeight: 1.55,
              color: 'var(--text-primary)',
            }}>
              Удалено записей: {wiped}.
            </p>
            <p style={{
              margin: '6px 0 0', fontSize: '13px', lineHeight: 1.55,
              color: 'var(--text-tertiary)',
            }}>
              Часть экранов покажет прежние значения, пока приложение не
              перезапустится — они уже стёрты из памяти устройства.
            </p>
          </div>
        )}
      </Card>

      {/* ── О приложении ─────────────────────────────────────────────── */}
      <SectionTitle>О приложении</SectionTitle>
      <Card>
        <Row label="Версия" value={__APP_VERSION__} />
        <Divider />
        <Row label="Перевод Корана" value="Эльмир Кулиев" />
        <Divider />
        <Row label="Арабский текст" value="Мусхаф Медины, QCF" />
        <Hint>
          Работает без интернета: текст, перевод и расчёт времени намаза
          лежат в приложении. Сеть нужна только для аудио и определения
          места.
        </Hint>
      </Card>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: '22px 2px 8px',
      fontSize: '10px', fontWeight: 600, letterSpacing: '0.10em',
      textTransform: 'uppercase', color: 'var(--text-tertiary)',
    }}>
      {children}
    </p>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section style={{
      borderRadius: '18px',
      border: '1px solid var(--hairline)',
      background: `
        radial-gradient(120% 130% at 100% 0%,
          color-mix(in srgb, var(--ink) 4%, transparent) 0%,
          transparent 58%),
        var(--surface)
      `,
      overflow: 'hidden',
    }}>
      {children}
    </section>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{
        height: '1px', marginLeft: '16px',
        background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
      }}
    />
  );
}

/** Строка списка.  Без onClick — просто значение, не кнопка. */
function Row({ icon, label, value, onClick }: {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      {icon && (
        <span style={{
          flexShrink: 0, display: 'inline-flex',
          color: 'var(--text-tertiary)',
        }}>
          {icon}
        </span>
      )}
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: '15px', color: 'var(--text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
      {value && (
        <span style={{
          flexShrink: 0, fontSize: '14px', color: 'var(--text-tertiary)',
        }}>
          {value}
        </span>
      )}
      {onClick && (
        <span style={{ flexShrink: 0, display: 'inline-flex', color: 'var(--text-tertiary)' }}>
          <ChevronRight size={15} />
        </span>
      )}
    </>
  );

  const style: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px',
    width: '100%', minHeight: '50px', padding: '10px 16px',
    fontFamily: 'inherit', textAlign: 'left',
  };

  if (!onClick) return <div style={style}>{content}</div>;

  return (
    <button
      onClick={onClick}
      style={{ ...style, border: 'none', background: 'transparent', cursor: 'pointer' }}
    >
      {content}
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: 0, padding: '0 16px 14px',
      fontSize: '11.5px', lineHeight: 1.55, color: 'var(--text-tertiary)',
    }}>
      {children}
    </p>
  );
}
