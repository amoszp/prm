import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing,
  CalendarPlus,
  ChevronRight,
  Download,
  FolderTree,
  LayoutTemplate,
  Info,
  ListRestart,
  LogOut,
  Repeat,
  Sparkles,
  Tags,
  TimerReset,
  Trash2,
  Upload,
  UserRound,
  Users,
} from 'lucide-react';
import { useData } from '@/stores/DataStore';
import { useSettings } from '@/stores/SettingsStore';
import { useCalendarExport } from '@/stores/useCalendarExport';
import { backupFileName, downloadJson, parseBackup } from '@/data/backup';
import { CURRENCIES } from '@/lib/currencies';
import { formatDateTime } from '@/lib/dates';
import { badgeSupported, notificationsSupported, showNotification } from '@/lib/notifications';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useAccount } from '@/components/AccountGate';
import { SERVER_MODE } from '@/lib/server';
import { Button, Segmented, Select, Switch } from '@/components/ui';
import type { BackupFile, ThemeMode } from '@/types';
import { LANGS, t, tn, type Lang } from '@/i18n';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group" aria-label={title}>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="card">{children}</div>
    </section>
  );
}

function Row({ label, desc, children, stack }: { label: string; desc?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={`settings-row ${stack ? 'stack' : ''}`}>
      <div>
        <div className="settings-label">{label}</div>
        {desc ? <div className="settings-desc">{desc}</div> : null}
      </div>
      {children}
    </div>
  );
}

function LinkRow({ to, icon, label, count }: { to: string; icon: ReactNode; label: string; count: number }) {
  return (
    <Link to={to} className="settings-row">
      <span className="settings-row-main">
        <span className="lead-mark" style={{ minWidth: 36, height: 36 }} aria-hidden="true">
          {icon}
        </span>
        <span className="settings-label">{label}</span>
      </span>
      <span className="settings-trail">
        {count}
        <ChevronRight size={16} />
      </span>
    </Link>
  );
}

export function SettingsPage() {
  const data = useData();
  const account = useAccount();
  const { settings, setTheme, updateSettings, replaceSettings } = useSettings();
  const { toast } = useToast();
  const exportCalendar = useCalendarExport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const permission = notificationsSupported() ? Notification.permission : 'unsupported';

  const toggleNotifications = async (on: boolean) => {
    if (!on) return updateSettings({ notificationsEnabled: false });
    if (!notificationsSupported()) {
      return toast(t('This browser can’t show notifications. On iPhone, add this app to your Home Screen first.'), { tone: 'error', duration: 6000 });
    }
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (result !== 'granted') return toast(t('Notifications are blocked for this site in your browser settings.'), { tone: 'error' });
    updateSettings({ notificationsEnabled: true });
    toast(t('Alerts on'), { tone: 'success' });
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      setPendingImport(parseBackup(await file.text()));
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Could not read that file.'), { tone: 'error' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const currencies = CURRENCIES.includes(settings.currency) ? CURRENCIES : [settings.currency, ...CURRENCIES];

  return (
    <div className="page page-narrow">
      <PageHeader title={t('Settings')} />

      <Group title={t('Appearance')}>
        <Row label={t('Language')} desc={t('Interface, dates and amounts.')}>
          <Segmented<Lang>
            label={t('Language')}
            value={settings.language ?? 'en'}
            onChange={(language) => updateSettings({ language })}
            options={LANGS.map((l) => ({ value: l.value, label: l.label }))}
          />
        </Row>
        <Row label={t('Theme')} desc={t('Follow your device, or pick one.')}>
          <Segmented<ThemeMode>
            label={t('Theme')}
            value={settings.theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: t('Light') },
              { value: 'system', label: t('Auto') },
              { value: 'dark', label: t('Dark') },
            ]}
          />
        </Row>
      </Group>

      <Group title={t('Preferences')}>
        <Row label={t('Default currency')} desc={t('Used for new amounts and the monthly total.')}>
          <Select value={settings.currency} aria-label={t('Default currency')} onChange={(e) => updateSettings({ currency: e.target.value })}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Row>
        <Row label={t('“Coming up” window')} desc={t('How far ahead counts as coming up in filters.')}>
          <Select
            value={String(settings.upcomingDays)}
            aria-label={t('“Coming up” window')}
            onChange={(e) => updateSettings({ upcomingDays: Number(e.target.value) })}
          >
            {[7, 14, 21, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                {t('{n} days', { n: d })}
              </option>
            ))}
          </Select>
        </Row>
      </Group>

      <Group title={t('Alerts')}>
        <Row
          label={t('Device notifications')}
          desc={
            permission === 'denied'
              ? t('Blocked in your browser settings.')
              : settings.notificationsEnabled
                ? t('On — fires each reminder’s alerts while the app is open.')
                : t('Off — alerts only show inside the app.')
          }
        >
          <Switch label={t('Device notifications')} checked={settings.notificationsEnabled} onChange={(v) => void toggleNotifications(v)} />
        </Row>
        <Row
          label={t('App icon badge')}
          desc={
            badgeSupported()
              ? t('Shows how many things are overdue or due today on the app’s Home Screen icon.')
              : t('Not available in this browser. On iPhone it works from the Home Screen app (iOS 16.4+) once notifications are on.')
          }
        >
          <Switch label={t('App icon badge')} checked={settings.badge !== false} onChange={(badge) => updateSettings({ badge })} />
        </Row>
        <Row label={t('Test')} desc={t('Send a sample notification to this device.')}>
          <Button
            size="sm"
            icon={<BellRing size={14} />}
            disabled={!settings.notificationsEnabled}
            onClick={() => {
              void showNotification(t('Test alert'), t('Alerts are working on this device.'), 'test-alert');
              toast(t('Test sent'));
            }}
          >
            {t('Send test')}
          </Button>
        </Row>
        <div className="settings-row">
          <div className="notice" style={{ width: '100%' }}>
            <Info size={16} />
            <span>
              {SERVER_MODE
                ? t('Your reminders are kept on your server, which sends each alert through Telegram, even with your phone locked or the app closed.')
                : t(
                    'Phase 1 keeps everything on this device, so alerts can only fire while the app is open. Phase 2 moves your data to Chiquitojaco and sends alerts through Telegram, even with your phone locked.',
                  )}
            </span>
          </div>
        </div>
      </Group>

      <Group title={t('Calendar')}>
        <Row
          label={t('Add to your calendar')}
          desc={t(
            'Exports every open reminder, with its alerts, as an .ics file. Open it on your iPhone and the alerts fire from Calendar even when the app is closed.',
          )}
        >
          <Button size="sm" icon={<CalendarPlus size={14} />} onClick={() => exportCalendar(data.reminders)}>
            {t('Export')}
          </Button>
        </Row>
        <div className="settings-row">
          <div className="notice" style={{ width: '100%' }}>
            <Info size={16} />
            <span>
              {t(
                'It’s a snapshot: changes made here afterwards don’t reach the calendar. To refresh it, delete the previously exported events from your calendar and export again, so nothing appears twice.',
              )}
            </span>
          </div>
        </div>
      </Group>

      <Group title={t('Your lists')}>
        <LinkRow to="/settings/templates" icon={<LayoutTemplate size={16} />} label={t('Templates')} count={data.templates.length} />
        <LinkRow to="/settings/people" icon={<UserRound size={16} />} label={t('People')} count={data.people.length} />
        <LinkRow to="/settings/categories" icon={<FolderTree size={16} />} label={t('Categories')} count={data.categories.length} />
        <LinkRow to="/settings/repeats" icon={<Repeat size={16} />} label={t('Repeat options')} count={data.repeatPresets.length} />
        <LinkRow to="/settings/alerts" icon={<TimerReset size={16} />} label={t('Alert options')} count={data.alertPresets.length} />
        <LinkRow to="/settings/provider-types" icon={<Tags size={16} />} label={t('Provider types')} count={data.providerTypes.length} />
        <LinkRow to="/providers" icon={<Users size={16} />} label={t('Providers')} count={data.providers.length} />
      </Group>

      {account ? (
        <Group title={t('Account')}>
          <Row label={t('Signed in as {name}', { name: account.user.displayName || account.user.username })} desc={t('Your data is on your server and the same on every device you sign in on. Attachments stay on the device where you added them.')}>
            <Button size="sm" icon={<LogOut size={14} />} onClick={account.signOut}>
              {t('Sign out')}
            </Button>
          </Row>
        </Group>
      ) : null}

      <Group title={t('Data')}>
        <Row
          label={t('Export backup')}
          desc={SERVER_MODE ? t('Everything, as one JSON file.') : t('Everything, as one JSON file. Also how you’ll move to the server later.')}
        >
          <Button
            size="sm"
            icon={<Download size={14} />}
            onClick={() => {
              downloadJson(backupFileName(), data.buildBackup(settings));
              toast(t('Backup downloaded'), { tone: 'success' });
            }}
          >
            {t('Export')}
          </Button>
        </Row>
        <Row
          label={t('Import backup')}
          desc={SERVER_MODE ? t('Replaces what’s in your account with the file’s contents.') : t('Replaces what’s on this device with the file’s contents.')}
        >
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button size="sm" icon={<Upload size={14} />} onClick={() => fileRef.current?.click()}>
              {t('Import')}
            </Button>
          </>
        </Row>
        <Row label={t('Load examples')} desc={t('Adds 10 sample reminders (insurance, DNI, YouTube…) to try things out.')}>
          <Button
            size="sm"
            icon={<Sparkles size={14} />}
            onClick={async () => {
              const res = await data.loadSamples();
              toast(res.ok ? t('Added {n} examples', { n: res.value }) : res.error.message, { tone: res.ok ? 'success' : 'error' });
            }}
          >
            {t('Load')}
          </Button>
        </Row>
        <Row label={t('Restore default lists')} desc={t('Re-adds any built-in category, option or template you deleted. Keeps your own.')}>
          <Button
            size="sm"
            icon={<ListRestart size={14} />}
            onClick={async () => {
              const res = await data.restoreDefaultLists();
              toast(res.ok ? t('Defaults restored') : res.error.message, { tone: res.ok ? 'success' : 'error' });
            }}
          >
            {t('Restore')}
          </Button>
        </Row>
        <Row label={t('Erase everything')} desc={t('Deletes all reminders, providers, people and attachments, and resets the lists.')}>
          <Button size="sm" variant="danger-quiet" icon={<Trash2 size={14} />} onClick={() => setConfirmReset(true)}>
            {t('Erase')}
          </Button>
        </Row>
      </Group>

      <ConfirmDialog
        open={Boolean(pendingImport)}
        title={t('Replace your data?')}
        confirmLabel={t('Replace')}
        onClose={() => setPendingImport(null)}
        onConfirm={async () => {
          if (!pendingImport) return;
          const res = await data.importBackup(pendingImport);
          if (res.ok && pendingImport.settings) replaceSettings(pendingImport.settings);
          setPendingImport(null);
          toast(res.ok ? t('Backup restored') : res.error.message, { tone: res.ok ? 'success' : 'error' });
        }}
      >
        {t('The backup from {date} has {reminders} and {providers}. Everything currently on this device will be replaced. Export first if you want to keep it.', {
          date: pendingImport ? formatDateTime(new Date(pendingImport.exportedAt)) : '',
          reminders: tn(pendingImport?.reminders.length ?? 0, '{n} reminder', '{n} reminders'),
          providers: tn(pendingImport?.providers.length ?? 0, '{n} provider', '{n} providers'),
        })}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmReset}
        title={t('Erase everything?')}
        confirmLabel={t('Erase everything')}
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          const res = await data.resetEverything();
          setConfirmReset(false);
          toast(res.ok ? t('All data erased') : res.error.message, { tone: res.ok ? 'info' : 'error' });
        }}
      >
        {t('{reminders} and {providers} will be permanently deleted, along with people and attachments, and your lists reset to the defaults. This can’t be undone — export a backup first if you might want them back.', {
          reminders: tn(data.reminders.length, '{n} reminder', '{n} reminders'),
          providers: tn(data.providers.length, '{n} provider', '{n} providers'),
        })}
      </ConfirmDialog>
    </div>
  );
}
