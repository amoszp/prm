import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { useSettings } from '@/stores/SettingsStore';
import { ErrorBoundary } from '@/components/EmptyState';
import { ManageAlertsPage } from '@/pages/ManageAlertsPage';
import { ManageCategoriesPage } from '@/pages/ManageCategoriesPage';
import { ManagePeoplePage } from '@/pages/ManagePeoplePage';
import { ManageProviderTypesPage } from '@/pages/ManageProviderTypesPage';
import { ManageRepeatsPage } from '@/pages/ManageRepeatsPage';
import { ManageTemplatesPage } from '@/pages/ManageTemplatesPage';
import { MoneyPage } from '@/pages/MoneyPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { ProvidersPage } from '@/pages/ProvidersPage';
import { ReminderDetailPage } from '@/pages/ReminderDetailPage';
import { ReminderFormPage } from '@/pages/ReminderFormPage';
import { RemindersPage } from '@/pages/RemindersPage';
import { SettingsPage } from '@/pages/SettingsPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Re-mount the whole UI when the language changes, so every label is redrawn. */
export default function App() {
  const { settings } = useSettings();
  return <Screens key={settings.language ?? 'en'} />;
}

function Screens() {
  const { pathname } = useLocation();
  return (
    <AppShell>
      <ScrollToTop />
      {/* key re-mounts the page so its entrance animation plays on navigation */}
      <ErrorBoundary key={pathname}>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/reminders" element={<RemindersPage />} />
        <Route path="/reminders/new" element={<ReminderFormPage />} />
        <Route path="/reminders/:id" element={<ReminderDetailPage />} />
        <Route path="/reminders/:id/edit" element={<ReminderFormPage />} />
        <Route path="/money" element={<MoneyPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/categories" element={<ManageCategoriesPage />} />
        <Route path="/settings/repeats" element={<ManageRepeatsPage />} />
        <Route path="/settings/alerts" element={<ManageAlertsPage />} />
        <Route path="/settings/provider-types" element={<ManageProviderTypesPage />} />
        <Route path="/settings/templates" element={<ManageTemplatesPage />} />
        <Route path="/settings/templates/new" element={<ReminderFormPage mode="template" />} />
        <Route path="/settings/templates/:id" element={<ReminderFormPage mode="template" />} />
        <Route path="/settings/people" element={<ManagePeoplePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </AppShell>
  );
}
