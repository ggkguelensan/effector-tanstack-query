import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
const requireCore = createRequire(resolve('packages/core/package.json'))

export default defineConfig({
  resolve: {
    alias: {
      '@effector-tanstack-query/core': resolve('packages/core/src/index.ts'),
      '@baseline/core': resolve(
        'scripts/compat/.baseline/packages/core/src/index.ts',
      ),
      '@baseline/react': resolve(
        'scripts/compat/.baseline/packages/react/src/index.ts',
      ),
      '@tanstack/query-core':
        process.env.QUERY_CORE_PATH ??
        requireCore.resolve('@tanstack/query-core'),
    },
  },
  test: {
    include: ['scripts/compat/*.test.ts', 'scripts/compat/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./test-setup.ts'],
  },
})
