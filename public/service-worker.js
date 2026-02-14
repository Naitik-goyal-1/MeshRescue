/* eslint-disable no-restricted-globals */

// This service worker caches the app shell and assets for offline use.
const CACHE_NAME = 'meshrescue-v1';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/html5-qrcode'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }
      return fetch(event.request).then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200) {
          return response;
        }

        // Basic check for opaque responses or non-basic types (like CORS)
        // We generally only cache basic requests, but for CDN assets (CORS), we might want to cache them.
        // However, response.clone() works for both.
        
        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          // Only cache requests from our own origin or specific CDNs (http/https)
           if (event.request.url.startsWith('http')) {
              cache.put(event.request, responseToCache);
           }
        });

        return response;
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});