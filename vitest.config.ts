import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
