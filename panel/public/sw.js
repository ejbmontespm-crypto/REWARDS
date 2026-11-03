// Service worker mínimo — solo existe para que el navegador considere el
// panel "instalable" (Agregar a pantalla de inicio / como app de
// escritorio) y para que cargue un poco más rápido en conexiones lentas.
// No es offline-first a propósito: esto es un dashboard de administración,
// los datos siempre tienen que ser los reales del servidor — por eso es
// "red primero, caché solo si la red falla", y nunca toca el dominio de
// la API (otro origen, fuera del scope de este service worker de todas
// formas).
const CACHE = "panel-shell-v1";
const ARCHIVOS_BASE = ["/", "/css/styles.css", "/js/main.js"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS_BASE)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  if (new URL(evento.request.url).origin !== location.origin) return;

  evento.respondWith(
    fetch(evento.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE).then((cache) => cache.put(evento.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(evento.request))
  );
});
