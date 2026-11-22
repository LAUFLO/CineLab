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
    // 97 个测试文件并行启动时，pi 的网络/会话测试会接近默认 5 秒阈值；
    // CI 的覆盖率运行更慢，统一放宽到 20 秒，避免偶发超时。
    testTimeout: 20000,
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
