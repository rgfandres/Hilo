import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/tokens.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
// La app ha arrancado: se permite otro rescate automático si algún día hiciera falta (ver index.html)
setTimeout(() => { try { sessionStorage.removeItem('hilo-rescate') } catch { /* sin almacenamiento */ } }, 10000)

// App instalable (PWA). Solo en producción: en desarrollo la caché estorbaría a la recarga en caliente.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
