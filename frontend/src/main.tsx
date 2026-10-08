import '@fontsource-variable/manrope';
import '@fontsource-variable/playfair-display';
import '@/app/styles/globals.css';
import '@/i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { bootstrapSession } from '@/lib/auth-session';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root elementi topilmadi');
}

// Render bilan parallel: cookie'dagi refresh token orqali sessiyani tiklaydi.
void bootstrapSession();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
