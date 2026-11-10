import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/lib/i18n';
import '@/styles/globals.css';
import { App } from '@/app/App';
import { Providers } from '@/app/Providers';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
