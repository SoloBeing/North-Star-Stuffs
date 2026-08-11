import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'FormMitra — सरकारी फॉर्म भरने में मदद',
        short_name: 'FormMitra',
        description:
          'Fill Indian government forms by voice, in your own language. Works offline.',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Tesseract's wasm core + trained-data files are large; cache them so the
        // second visit works with zero internet (spec: offline is non-negotiable).
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,json,wasm}'],
        runtimeCaching: [
          {
            // Tesseract downloads its language model from a CDN on first use.
            urlPattern: /^https:\/\/.*\/(tesseract|tessdata).*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-models',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  // `npm run preview` is how you test the service worker, since it is disabled
  // in dev. It needs the same proxy or DigiLocker login 404s there.
  preview: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
