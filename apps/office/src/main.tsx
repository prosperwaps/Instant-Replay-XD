import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App';
import { AppProviders } from './app/context';
import { Repository, browserStorageAdapter } from './data/repository';
import { createSeed } from './data/seed';
import { ToastProvider } from './ui';

const repository = new Repository(browserStorageAdapter('bchs-admin-v1'), { seed: createSeed });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders repository={repository}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AppProviders>
  </StrictMode>,
);
