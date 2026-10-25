import { render } from '@testing-library/react';
import { App } from '../app/App';
import { AppProviders } from '../app/context';
import { Repository, memoryAdapter } from '../data/repository';
import { createSeed } from '../data/seed';
import { ToastProvider } from '../ui';

export const NOW = new Date('2026-10-23T09:00:00Z'); // Friday 10:00 in Douala

/** Renders the whole app at `path`, optionally signed in as `staffId`, on a fresh sample school. */
export function renderApp(path = '/', staffId?: string) {
  const repo = new Repository(memoryAdapter(), { seed: createSeed, now: () => NOW });
  if (staffId) sessionStorage.setItem('bchs-admin-session', JSON.stringify({ staffId, signedInAt: NOW.toISOString() }));
  const utils = render(
    <AppProviders repository={repo} clock={() => NOW}>
      <ToastProvider>
        <App initialPath={path} />
      </ToastProvider>
    </AppProviders>,
  );
  return { ...utils, repo };
}
