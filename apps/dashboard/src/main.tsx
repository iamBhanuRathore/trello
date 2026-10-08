import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { App } from './App.tsx';
import { queryClient } from './lib/queryClient';
import { initSentry } from './lib/sentry';

import { useThemeStore } from './store/themeStore';

// Error monitoring goes up before anything that can throw. Must be a real
// call, not a bare `import './lib/sentry'` — the bundler tree-shakes an
// import-only module whose exports are never referenced, which silently
// produced builds with no SDK in the bundle at all.
initSentry();

// Initialize theme on initial bundle load
useThemeStore.getState().initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
