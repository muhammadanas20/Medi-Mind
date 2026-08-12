import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'MediMind — AI Medication Manager',
        short_name: 'MediMind',
        description:
          'Privacy-first, offline AI medication management. Scan prescriptions, confirm, get reminded.',
        theme_color: '#0d9488',
        background_color: '#0b0f14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Tesseract language data + wasm — cache-first so OCR works offline after first use
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js/,
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract-core', expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: /^https:\/\/tessdata\.projectnaptha\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract-lang', expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,
    allowedHosts: true,
  },
  preview: { host: true, port: 4173, allowedHosts: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
} as never)
