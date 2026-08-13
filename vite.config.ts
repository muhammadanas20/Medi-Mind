import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub exposes the current owner/repository to every Actions job. Prefer it
// over a manually configured VITE_BASE so a stale or renamed repository path
// can never make the deployed JavaScript and CSS return 404.
const githubRepositoryName = process.env.GITHUB_REPOSITORY?.split('/').at(-1)
const deploymentBase =
  process.env.GITHUB_ACTIONS === 'true' && githubRepositoryName
    ? `/${githubRepositoryName}/`
    : process.env.VITE_BASE || '/'

export default defineConfig({
  base: deploymentBase,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      // Make the secure live preview installable too. In production the same
      // manifest and generated service worker are registered automatically.
      devOptions: { enabled: true, type: 'module', suppressWarnings: true },
      manifest: {
        id: './',
        name: 'MediMind — AI Medication Manager',
        short_name: 'MediMind',
        description:
          'Privacy-first, offline AI medication management. Scan prescriptions, confirm, get reminded.',
        theme_color: '#0d9488',
        background_color: '#0b0f14',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait-primary',
        scope: './',
        start_url: './#/',
        lang: 'en',
        dir: 'ltr',
        categories: ['medical', 'health', 'lifestyle', 'utilities'],
        prefer_related_applications: false,
        launch_handler: { client_mode: 'focus-existing' },
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          {
            name: "Today's plan",
            short_name: 'Today',
            description: "Open today's medication schedule",
            url: './#/',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Scan a prescription',
            short_name: 'Scan',
            description: 'Open the prescription camera',
            url: './#/scan',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'My medicines',
            short_name: 'Medicines',
            description: 'View and manage medicines',
            url: './#/meds',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
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
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-anim': ['framer-motion'],
          'vendor-data': ['dexie', 'dexie-react-hooks', '@tanstack/react-query', 'zustand', 'zod'],
        },
      },
    },
  },
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
