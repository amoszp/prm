import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/fraunces/opsz.css';
import App from './App';
import { DataStoreProvider } from '@/stores/DataStore';
import { SettingsStoreProvider } from '@/stores/SettingsStore';
import { ToastProvider } from '@/components/Toast';
import '@/styles/tokens.css';
import '@/styles/app.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found.');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SettingsStoreProvider>
        <ToastProvider>
          <DataStoreProvider>
            <App />
          </DataStoreProvider>
        </ToastProvider>
      </SettingsStoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
