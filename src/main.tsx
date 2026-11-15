import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { GoogleMapsProvider } from './components/common/GoogleMapsProvider';
import './index.css';

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

function notifyGmpQuotaExceeded(message: string) {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded', { detail: { message } }));
}

window.gm_authFailure = () => {
  notifyGmpQuotaExceeded('gm_authFailure');
};

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const text = args
    .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : ''))
    .join(' ');
  if (
    text.includes('OverQuotaMapError') ||
    text.includes('QuotaExceededError') ||
    text.includes('OVER_QUERY_LIMIT') ||
    text.includes('RESOURCE_EXHAUSTED')
  ) {
    notifyGmpQuotaExceeded(text);
  }
  origConsoleError.apply(console, args);
};

createRoot(document.getElementById('root')!).render(
  <GoogleMapsProvider>
    <App />
  </GoogleMapsProvider>
);
