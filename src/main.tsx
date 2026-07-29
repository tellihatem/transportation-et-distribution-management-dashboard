import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Auth is disabled: this app is deployed to a single trusted client machine,
// so there's no login gate (AuthGate.tsx is still here, unused, if a login
// gate is ever needed again).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
