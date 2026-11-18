import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '../../src/components/AppShell';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell page="sidepanel">
      <App />
    </AppShell>
  </StrictMode>,
);
