import { useEffect, useMemo, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, LayoutGrid, ListChecks, Moon, Plus, Settings2, Sun, Wallet } from 'lucide-react';
import { useData } from '@/stores/DataStore';
import { useSettings } from '@/stores/SettingsStore';
import { badgeCount, urgency } from '@/lib/reminders';
import { setAppBadge } from '@/lib/notifications';
import { useAlertScheduler } from '@/lib/useAlertScheduler';
import { BrandMark } from './BrandMark';
import { useToast } from './Toast';
import { Button, Segmented } from './ui';
import { m, t } from '@/i18n';

const NAV = [
  { to: '/', label: m('Overview'), icon: LayoutGrid, end: true },
  { to: '/reminders', label: m('Reminders'), icon: ListChecks, end: false },
  { to: '/money', label: m('Money'), icon: Wallet, end: false },
  { to: '/settings', label: m('Settings'), icon: Settings2, end: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { reminders, now } = useData();
  const { settings, setTheme } = useSettings();
  const { toast } = useToast();

  const overdue = useMemo(
    () => reminders.filter((r) => urgency(r, settings.upcomingDays, now) === 'overdue').length,
    [reminders, settings.upcomingDays, now],
  );

  const badge = useMemo(() => badgeCount(reminders, now), [reminders, now]);
  useEffect(() => {
    void setAppBadge(settings.badge === false ? 0 : badge);
  }, [badge, settings.badge]);

  useAlertScheduler(reminders, settings.notificationsEnabled, (title, body, id) =>
    toast(`${title} — ${body}`, { action: { label: t('View'), onClick: () => navigate(`/reminders/${id}`) } }),
  );

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        {t('Skip to content')}
      </a>

      <aside className="sidebar" aria-label={t('Sidebar')}>
        <NavLink to="/" className="brand" aria-label={t('Overview')}>
          <BrandMark />
        </NavLink>

        <Button variant="primary" block icon={<Plus size={16} />} onClick={() => navigate('/reminders/new')}>
          {t('New reminder')}
        </Button>

        <nav className="side-nav" aria-label={t('Main')}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="side-link">
              <Icon size={18} />
              {t(label)}
              {to === '/reminders' && overdue > 0 ? (
                <span className="count danger" aria-label={t('{n} overdue', { n: overdue })}>
                  {overdue}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Segmented
            label={t('Theme')}
            value={settings.theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: <Sun size={14} aria-label={t('Light')} /> },
              { value: 'system', label: t('Auto') },
              { value: 'dark', label: <Moon size={14} aria-label={t('Dark')} /> },
            ]}
          />
          <p className="phase-note">
            <Bell size={12} style={{ verticalAlign: '-1px' }} /> {t('Stored on this device. Server sync & Telegram alerts come in phase 2.')}
          </p>
        </div>
      </aside>

      <main id="main" className="main">
        {children}
      </main>

      <nav className="tabbar" aria-label={t('Main')}>
        {NAV.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tab">
            <Icon size={21} />
            {t(label)}
            {to === '/reminders' && overdue > 0 ? <span className="dot" aria-label={t('{n} overdue', { n: overdue })} /> : null}
          </NavLink>
        ))}
        <button type="button" className="tab-add" aria-label={t('New reminder')} onClick={() => navigate('/reminders/new')}>
          <Plus size={24} strokeWidth={2.4} />
        </button>
        {NAV.slice(2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tab">
            <Icon size={21} />
            {t(label)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
