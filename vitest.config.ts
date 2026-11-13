import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/shared/**/*.ts', 'src/main/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.d.ts'],
      thresholds: {
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30
      }
    }
  }
})
