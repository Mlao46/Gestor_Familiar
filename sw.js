// Service worker: funciona sin conexión y recibe archivos compartidos (Android).
// Sube VERSION cada vez que publiques cambios para que los móviles se actualicen.
const VERSION = 'gf-1.2.0';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/estilos.css',
  'js/app.js', 'js/tema.js', 'js/ui.js', 'js/vistas.js', 'js/ajustes.js', 'js/almacen.js', 'js/servicio.js', 'js/sync.js', 'js/ia.js',
  'js/core/xlsx.js', 'js/core/banco.js', 'js/core/clasificador.js', 'js/core/calculos.js', 'js/core/categorias.js', 'js/core/cripto.js', 'js/core/util.js', 'js/core/presentacion.js', 'js/core/grupos.js',
  'iconos/icono.svg', 'iconos/icono-192.png', 'iconos/icono-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'compartido').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Supabase y la API de Claude van directos, nunca a caché
  if (e.request.method === 'POST' && url.pathname.endsWith('/compartir')) {
    e.respondWith((async () => {
      const datos = await e.request.formData();
      const f = datos.get('archivo');
      if (f) {
        const c = await caches.open('compartido');
        await c.put('archivo', new Response(f, { headers: { 'x-nombre': encodeURIComponent(f.name || 'extracto.xlsx') } }));
      }
      return Response.redirect(new URL('./?compartido=1#/importar', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // Primero la red (para recibir actualizaciones); si no hay conexión, la caché
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
