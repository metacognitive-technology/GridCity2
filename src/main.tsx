import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import HelpPage from './HelpPage.tsx';
import { AuthProvider } from './components/auth/AuthProvider.tsx';
import { AuthDialogs } from './components/auth/SignInDialog.tsx';
import './index.css';

function isHelpPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p === '/help' || p === '/docs';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isHelpPath(window.location.pathname) ? <HelpPage /> : (
      <AuthProvider>
        <App />
        <AuthDialogs />
      </AuthProvider>
    )}
  </StrictMode>,
);
