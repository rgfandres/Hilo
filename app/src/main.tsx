import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/tokens.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// App instalable (PWA). Solo en producción: en desarrollo la caché estorbaría a la recarga en caliente.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
