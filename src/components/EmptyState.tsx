import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { t } from '@/i18n';

/** Keeps a crash in one screen from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState
        icon={<TriangleAlert size={22} />}
        title={t('This screen hit a problem')}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => window.location.assign('/')}>
            {t('Back to Overview')}
          </button>
        }
      >
        {t('Your data is safe.')} {this.state.error.message}
      </EmptyState>
    );
  }
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function EmptyState({ icon, title, children, actions }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-mark" aria-hidden="true">
        {icon}
      </div>
      <p className="empty-title">{title}</p>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}
