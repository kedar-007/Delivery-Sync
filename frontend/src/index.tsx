import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './contexts/I18nContext';
import { SidebarProvider } from './contexts/SidebarContext';
import queryClient from './lib/queryClient';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    {/* ThemeProvider must wrap everything so CSS vars are set before first paint */}
    <ThemeProvider>
      <I18nProvider>
        <SidebarProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <App />
            </AuthProvider>
          </QueryClientProvider>
        </SidebarProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
