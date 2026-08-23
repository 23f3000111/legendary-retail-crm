/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5180, open: true },
  test: {
    // The store persists to localStorage, which Node lacks. See the setup file.
    setupFiles: ['./src/test/setup.ts'],
  },
})
