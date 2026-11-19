/// <reference types="vitest" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5180, open: true },
  build: {
    rollupOptions: {
      // The CRM, and the Backups page (crm.legendary.com.my/backups/), which
      // shares no bundle with it: OpenPGP.js never ships to the staff app.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        backups: fileURLToPath(new URL('./backups/index.html', import.meta.url)),
      },
    },
  },
  test: {
    // The store persists to localStorage, which Node lacks. See the setup file.
    setupFiles: ['./src/test/setup.ts'],
  },
})
