import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@shared/App';
import '@shared/styles/app.css';
import { initWebDb, getWebDbAdapter } from './db/schema-web';
import { installWebElectronApi } from './api/webElectronApi';

async function bootstrap() {
  await initWebDb();
  installWebElectronApi();

  const flushOnHide = () => { void getWebDbAdapter().flushNow(); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnHide();
  });
  window.addEventListener('beforeunload', flushOnHide);

  const root = document.getElementById('root')!;
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
