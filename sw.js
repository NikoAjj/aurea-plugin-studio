const CACHE_NAME = 'aurea-plugin-studio-v1';
const ASSETS = [
  './',
  './index.html',
  './css/tokens.css',
  './css/base.css',
  './css/screens.css',
  './css/components.css',
  './js/app.js',
  './js/editor/code-editor.js',
  './js/preview/webgl-engine.js',
  './js/preview/param-renderer.js',
  './js/exporter/packager.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
