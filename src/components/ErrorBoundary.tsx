/**
 * ErrorBoundary — defensive wrapper для каждого экрана.
 *
 * Без него один битый JSON / неожиданная ошибка в render-tree
 * выбивает ВЕСЬ app в белый экран — без вариантов восстановления.
 * Особенно болезненно в native-обёртке (Capacitor): пользователь
 * убьёт app через task switcher, придёт в один-звёздное ревью.
 *
 * Стратегия:
 *  • Ловим ошибку в componentDidCatch.
 *  • Показываем минимальный fallback с кнопкой «Назад» / «Перезагрузить».
 *  • Логируем в Sentry если он подключён (через window'овский guard,
 *    чтобы не тащить hard dependency).
 *
 * UX-fallback намеренно неброский — мы не хотим, чтобы пользователь
 * увидел его как «фичу», только как «упс, что-то сломалось, восстановим».
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '../lib/sentry';

type Props = {
  /** Что показать на ошибке.  Если не задано — стандартный fallback. */
  fallback?: ReactNode;
  /** Что делать на «Назад» (когда экран — отдельный route). */
  onReset?: () => void;
  /** Имя экрана для логов / Sentry. */
  name: string;
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Логируем в Sentry (no-op без VITE_SENTRY_DSN — см. lib/sentry.ts).
    captureError(error, {
      screen: this.props.name,
      componentStack: info.componentStack,
    });
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const message = this.state.error?.message ?? 'неизвестная ошибка';
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--canvas)',
        color: 'var(--text-primary)',
        fontFamily: 'inherit',
      }}>
        <div style={{ maxWidth: '420px', textAlign: 'center' }}>
          <div style={{
            fontSize: '17px',
            fontWeight: 600,
            marginBottom: '10px',
            letterSpacing: '-0.01em',
          }}>
            Что-то пошло не так
          </div>
          <div style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: '24px',
          }}>
            Экран не смог загрузиться. Попробуй вернуться назад или
            перезагрузить приложение.
          </div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            opacity: 0.7,
            marginBottom: '24px',
            wordBreak: 'break-word',
          }}>
            {this.props.name}: {message}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {this.props.onReset && (
              <button
                onClick={this.reset}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: '1px solid var(--hairline)',
                  background: 'rgb(var(--ink-rgb) / 0.06)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Назад
              </button>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid var(--text-primary)',
                background: 'var(--text-primary)',
                color: 'var(--canvas)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              Перезагрузить
            </button>
          </div>
        </div>
      </div>
    );
  }
}
