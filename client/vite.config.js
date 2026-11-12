import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'MySpa · Biblioteca digital',
      short_name: 'MySpa',
      description: 'Explora, reserva y gestiona tu biblioteca.',
      lang: 'es-MX',
      theme_color: '#182b35',
      background_color: '#f7f9f7',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons: [{
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }]
    },
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: []
    },
    devOptions: { enabled: false }
  })],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true } }
  },
  build: { outDir: 'dist' }
});
