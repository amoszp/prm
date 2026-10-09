import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}

export function PageHeader({ eyebrow, title, sub, actions, back }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <>
      {back ? (
        <button type="button" className="back-link" onClick={() => navigate(back.to)}>
          <ChevronLeft size={16} /> {back.label}
        </button>
      ) : null}
      <header className="page-head">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h1 className="page-title">{title}</h1>
          {sub ? <p className="page-sub">{sub}</p> : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </header>
    </>
  );
}
