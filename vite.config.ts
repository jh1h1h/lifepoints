import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'pages-spa-fallback',
      closeBundle() {
        copyFileSync('dist/index.html', 'dist/404.html')
      },
    },
  ],
  base: process.env.VITE_BASE_PATH || '/',
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', 'tests/integration/**', 'node_modules/**'],
  },
})
