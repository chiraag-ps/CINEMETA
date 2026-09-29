import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Remove tracking parameters such as ?utm_source=chatgpt.com
const url = new URL(window.location.href);

if (url.searchParams.has('utm_source')) {
  url.searchParams.delete('utm_source');

  window.history.replaceState(
    {},
    '',
    `${url.pathname}${url.search}${url.hash}`
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);