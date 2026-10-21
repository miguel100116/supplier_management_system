import React from 'react';
import ReactDOM from 'react-dom/client';
import { configureMsal } from './services/msalAuth';
import './styles.css';
import './features/employee-experience/components/employeeExperience.css';
import './adminWorkspace.css';
import './darkTheme.css';

async function startApp() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      const runtimeConfig = await response.json();
      window.__SMS_RUNTIME_CONFIG__ = runtimeConfig;
      configureMsal(runtimeConfig);
    }
  } catch {
    // Static hosting may not provide /api/config; build-time env remains valid.
  }

  const { default: App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void startApp();
