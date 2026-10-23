import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

const shared = { '@shared': resolve(import.meta.dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias: shared },
    build: { externalizeDeps: true }
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias: shared },
    build: {
      rollupOptions: { input: resolve(import.meta.dirname, 'src/renderer/index.html') }
    }
  }
})
