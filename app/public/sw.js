/* Hilo · service worker mínimo.
   Permite instalar la app y abre al instante la última versión de la interfaz.
   Los datos NUNCA se guardan aquí: todo lo que viene de Supabase va siempre a la red. */
const CACHE = 'hilo-app-v2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  // Solo la propia app (mismo origen) y solo GET; nada de API ni de otros dominios
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  // Navegación: red primero y, sin conexión, la última página guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const c = r.clone(); const t = r.clone(); caches.open(CACHE).then((ca) => ca.put('/', c)); t.text().then(limpiar).catch(() => {}) }
      return r
    })
      .catch(() => caches.match('/').then((r) => r || Response.error())))
    return
  }
  // Recursos con huella (/assets/…): caché primero
  if (url.pathname.startsWith('/assets/')) {
    // Solo se guarda si de verdad es el recurso: durante un despliegue la ruta aún puede
    // devolver la página (HTML) y guardarla dejaría la app en blanco
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      const tipo = res.headers.get('content-type') || ''
      if (res.ok && !tipo.includes('text/html')) { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)) }
      return res
    })))
  }
})

/* Borra de la caché los recursos de versiones anteriores (los que ya no cita la página actual).
   Si más tarde hace falta alguno que no esté, se vuelve a pedir a la red. */
function limpiar(html) {
  const vivos = new Set((html.match(/\/assets\/[^"'\s)]+/g) || []))
  if (!vivos.size) return
  caches.open(CACHE).then((ca) => ca.keys().then((ks) => Promise.all(ks.map((k) => {
    const p = new URL(k.url).pathname
    return p.startsWith('/assets/') && !vivos.has(p) ? ca.delete(k) : null
  }))))
}
