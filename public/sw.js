/**
 * MemoryDeck Service Worker
 *
 * Strategy:
 *   - App shell (HTML, JS, CSS, fonts): cache-first with background refresh
 *   - Navigations: serve cached index.html so the SPA loads offline
 *   - Base44 API calls: network-only (auth-sensitive, must be fresh)
 *
 * This means the app UI always loads instantly from cache, even with no
 * connection. API data fetches will fail gracefully with the existing
 * "Sync failed" indicator in the UI.
 */

const CACHE = 'memorydeck-v1'

// Pre-cache the app shell on install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(['/', '/index.html'])
    )
  )
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting()
})

// Remove stale caches on activate
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Only handle GET requests
  if (request.method !== 'GET') return

  // Skip Base44 API and auth calls — always go to network
  if (url.hostname !== self.location.hostname) return

  // Navigation requests — serve the SPA shell (enables offline launch)
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Static assets — cache-first, update cache in background
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const networkFetch = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone())
          return res
        }).catch(() => cached)
        // Return cached immediately if available; network response updates cache
        return cached || networkFetch
      })
    )
  )
})
