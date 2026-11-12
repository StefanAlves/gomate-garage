import { defineConfig } from 'vitest/config'

// Tests run server modules directly against an in-memory SQLite database.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    env: { DATABASE_PATH: ':memory:' },
    include: ['src/**/*.test.ts'],
  },
})
