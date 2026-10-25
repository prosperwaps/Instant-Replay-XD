import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no layout; the shell scrolls to the top on navigation.
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
