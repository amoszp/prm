import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Settings, ThemeMode } from '@/types';
import { deviceLang, setLang, type Lang } from '@/i18n';

const SETTINGS_KEY = 'prm:settings';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  currency: 'EUR',
  upcomingDays: 14,
  notificationsEnabled: false,
  badge: true,
  language: deviceLang(),
};

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function systemTheme(): 'light' | 'dark' {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface SettingsStore {
  settings: Settings;
  resolvedTheme: 'light' | 'dark';
  setTheme: (mode: ThemeMode) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  replaceSettings: (next: Settings) => void;
}

const SettingsContext = createContext<SettingsStore | null>(null);

export function SettingsStoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(readSettings);
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme);

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mql) return;
    const onChange = () => setSystem(mql.matches ? 'dark' : 'light');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = settings.theme === 'system' ? system : settings.theme;
  const language: Lang = settings.language ?? 'en';
  // Set before children render, so every t() call in this render uses it.
  setLang(language);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', resolvedTheme === 'dark' ? '#161015' : '#f7f3f2');
  }, [resolvedTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // private mode / quota — settings just won't persist
    }
  }, [settings]);

  const setTheme = useCallback((theme: ThemeMode) => setSettings((p) => ({ ...p, theme })), []);
  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((p) => ({ ...p, ...patch })), []);
  const replaceSettings = useCallback((next: Settings) => setSettings({ ...DEFAULT_SETTINGS, ...next }), []);

  const value = useMemo(
    () => ({ settings, resolvedTheme, setTheme, updateSettings, replaceSettings }),
    [settings, resolvedTheme, setTheme, updateSettings, replaceSettings],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsStore {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsStoreProvider.');
  return ctx;
}
