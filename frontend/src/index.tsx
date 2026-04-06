import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './contexts/I18nContext';
import { SidebarProvider } from './contexts/SidebarContext';
import queryClient from './lib/queryClient';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

// If this page is loaded inside an iframe (Catalyst's OAuth redirect loads
// service_url="/app/index.html" in an iframe to complete the handshake),
// render nothing — Catalyst handles the frame internally.
if (window.self !== window.top) {
  root.render(<div style={{ display: 'none' }} />);
} else {
  // No StrictMode — it causes Catalyst's signIn() to be called twice:
  // first run injects the iframe, cleanup clears it, second run skips
  // (didInit guard) → white box. LMS reference project has the same pattern.
  root.render(
    <ThemeProvider>
      <I18nProvider>
        <SidebarProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </SidebarProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
