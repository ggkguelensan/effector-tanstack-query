import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['scripts/compat/.baseline/packages/core/src/index.ts'],
  outDir: 'scripts/compat/.baseline/dist',
  format: ['esm', 'cjs'],
  dts: true,
  external: ['@tanstack/query-core', 'effector'],
  tsconfig: 'tsconfig.base.json',
})
