import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
// vite-plugin-pwa: MIT, vite-pwa/vite-plugin-pwa, Workbox integration for Vite.
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    reporters: process.env.CI ? ['junit'] : ['default'],
    outputFile: process.env.CI ? 'test-results/junit.xml' : undefined,
    // Exclude Playwright E2E tests — they require a running browser via @playwright/test.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
  // assetsInclude: include .wasm so Vite handles sql.js WASM correctly.
  assetsInclude: ['**/*.wasm'],
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Cache all common static asset types for full offline app shell support.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // API entity reads: stale-while-revalidate, 5-minute max age.
            urlPattern: /^https:\/\/api\.base44\.app\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'base44-api-cache',
              expiration: { maxAgeSeconds: 300 },
            },
          },
          {
            // Images: cache-first, 30-day expiry.
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxAgeSeconds: 2592000, maxEntries: 100 },
            },
          },
        ],
      },
      // Note: vite-plugin-pwa generates its own manifest; public/manifest.json
      // is also kept for legacy browser compatibility. Both should stay in sync.
      manifest: {
        name: 'Nidus Recall',
        short_name: 'Nidus',
        description: 'Spaced repetition for postgraduate learners.',
        theme_color: '#2D6E52',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/library',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      // Only enable the dev service worker during local development.
      // Leaving this true in production compiles a Workbox dev-mode SW that
      // disables all caching, silently breaking offline-first behaviour for
      // every production user. (audit finding SEC-01)
      devOptions: { enabled: process.env.NODE_ENV !== 'production' },
    }),
  ]
});