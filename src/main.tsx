import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import HelpPage from './HelpPage.tsx';
import './index.css';

function isHelpPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  return p === '/help' || p === '/docs';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isHelpPath(window.location.pathname) ? <HelpPage /> : <App />}
  </StrictMode>,
);
