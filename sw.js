// sw.js (Service Worker for Caching)
const CACHE_NAME = 'glasscall-v1';
const urlsToCache = [
    '/',
    'index.html',
    'style.css',
    'frontend.js',
    'manifest.json',
    // Add paths to icon-192.png and icon-512.png here
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                // No cache hit - fetch from network
                return fetch(event.request);
            })
    );
});