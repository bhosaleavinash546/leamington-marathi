import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// Mobile: prepend configured server URL to all /api calls
;(() => {
  const serverUrl = (localStorage.getItem('brainspark_server_url') || '').replace(/\/$/, '');
  if (!serverUrl) return;
  const _fetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api')) {
      return _fetch(serverUrl + input, init);
    }
    return _fetch(input, init);
  };
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
