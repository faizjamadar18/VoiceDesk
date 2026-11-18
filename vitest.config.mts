import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./apps/desktop/src/shared', import.meta.url)),
      '@renderer': fileURLToPath(new URL('./apps/desktop/src/renderer/src', import.meta.url)),
      '@': fileURLToPath(new URL('./apps/desktop/src/renderer/src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['apps/desktop/src/**/*.test.{ts,tsx}']
  }
})
