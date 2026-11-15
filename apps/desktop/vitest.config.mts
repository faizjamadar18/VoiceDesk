import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts', 'src/renderer/**/*.test.{ts,tsx}']
  }
})
