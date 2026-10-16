// Server mode only: decides between the sign-in screen and the app, and
// moves this device's phase-1 data into the account the first time anyone
// signs in here (see importDeviceDataOnce).

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BrandMark } from './BrandMark';
import { Button, Field, Input, LoadingPage } from './ui';
import { useSettings } from '@/stores/SettingsStore';
import { apiRequest, ApiError, importDeviceDataOnce, SIGNED_OUT_EVENT, type AccountUser } from '@/lib/server';
import { t } from '@/i18n';

const AccountContext = createContext<{ user: AccountUser; signOut: () => void } | null>(null);

/** The signed-in account (server mode); null in on-device builds. */
export const useAccount = () => useContext(AccountContext);

type Phase = { phase: 'loading' } | { phase: 'login' } | { phase: 'offline' } | { phase: 'ready'; user: AccountUser };

export function AccountGate({ children }: { children: (user: AccountUser) => ReactNode }) {
  const { settings } = useSettings();
  const [state, setState] = useState<Phase>({ phase: 'loading' });

  const start = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      const { user } = await apiRequest<{ user: AccountUser }>('GET', '/auth/me');
      await importDeviceDataOnce(settings);
      setState({ phase: 'ready', user });
    } catch (err) {
      setState({ phase: err instanceof ApiError && err.status === 401 ? 'login' : 'offline' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings only ride along with the one-time import
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    const signedOut = () => setState({ phase: 'login' });
    window.addEventListener(SIGNED_OUT_EVENT, signedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiRequest('POST', '/auth/logout');
    } catch {
      /* offline: this screen still signs out */
    }
    setState({ phase: 'login' });
  }, []);

  if (state.phase === 'login') return <SignIn onSignedIn={start} />;
  if (state.phase === 'ready') {
    return <AccountContext.Provider value={{ user: state.user, signOut }}>{children(state.user)}</AccountContext.Provider>;
  }
  if (state.phase === 'offline') {
    return (
      <div className="auth-screen">
        <div className="card card-pad auth-card">
          <BrandMark className="auth-mark" />
          <h1 className="auth-title">{t('Can’t reach PRM')}</h1>
          <p className="auth-sub">{t('Check your connection and try again.')}</p>
          <Button variant="primary" block size="lg" onClick={() => void start()}>
            {t('Try again')}
          </Button>
        </div>
      </div>
    );
  }
  return <LoadingPage />;
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [form, setForm] = useState({ name: '', username: '', password: '', password2: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (signup && form.password !== form.password2) {
      setError(t('The passwords don’t match.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (signup) {
        await apiRequest('POST', '/auth/signup', { displayName: form.name.trim(), username: form.username.trim(), password: form.password });
      } else {
        await apiRequest('POST', '/auth/login', { username: form.username.trim(), password: form.password });
      }
      onSignedIn();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(
        status === 0
          ? t('No connection. Try again in a moment.')
          : status === 409
            ? t('That username is taken.')
            : status === 429
              ? t('Too many attempts. Wait a few minutes.')
              : signup && status === 400
                ? t('Check the username: lowercase letters, numbers, dot, dash or underscore.')
                : t('Wrong username or password.'),
      );
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="card card-pad auth-card" onSubmit={(e) => void submit(e)}>
        <BrandMark className="auth-mark" />
        <h1 className="auth-title">{signup ? t('Create account') : t('Sign in')}</h1>
        <p className="auth-sub">{signup ? t('Your reminders, on every device.') : t('Sign in to see your reminders.')}</p>

        {signup ? (
          <Field label={t('Name')} htmlFor="auth-name">
            <Input id="auth-name" {...field('name')} autoComplete="name" maxLength={40} required />
          </Field>
        ) : null}
        <Field label={t('Username')} htmlFor="auth-username" hint={signup ? t('Lowercase letters, numbers, dot, dash or underscore.') : undefined}>
          <Input
            id="auth-username"
            {...field('username')}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={32}
            required
          />
        </Field>
        <Field label={t('Password')} htmlFor="auth-password">
          <Input
            id="auth-password"
            type="password"
            {...field('password')}
            autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={signup ? 4 : undefined}
            required
          />
        </Field>
        {signup ? (
          <Field label={t('Repeat password')} htmlFor="auth-password2">
            <Input id="auth-password2" type="password" {...field('password2')} autoComplete="new-password" minLength={4} required />
          </Field>
        ) : null}

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" block size="lg" disabled={busy}>
          {busy ? t('One moment…') : signup ? t('Create account') : t('Sign in')}
        </Button>
        <Button
          variant="ghost"
          block
          onClick={() => {
            setMode(signup ? 'login' : 'signup');
            setError('');
          }}
        >
          {signup ? t('I already have an account') : t('No account? Create one')}
        </Button>
      </form>
    </div>
  );
}
