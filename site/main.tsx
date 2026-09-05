import React from 'react';
import ReactDOM from 'react-dom/client';
import StaticSite from './StaticSite';

// There is no API on GitHub Pages. HomePage's two calls already tolerate
// failure, but letting them hit the network would put two 404s in every
// visitor's console for no benefit, so they are short-circuited here.
{
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('/api') || url.includes('/api/')) {
      return Promise.resolve(new Response(null, { status: 503, statusText: 'No backend on the static preview' }));
    }
    return real(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StaticSite />
  </React.StrictMode>,
);
