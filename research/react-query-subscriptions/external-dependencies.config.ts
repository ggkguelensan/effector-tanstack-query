import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import base from '../../packages/react/vite.config'
const manifest = process.env.QUERY_SUBSCRIPTION_DEPENDENCY_MANIFEST
if (!manifest) throw new Error('Set QUERY_SUBSCRIPTION_DEPENDENCY_MANIFEST to an installed consumer package.json')
const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(path.resolve(manifest))
const native = require.resolve('@tanstack/react-query').replace(/index\.cjs$/, 'index.js')
const core = createRequire(native).resolve('@tanstack/query-core').replace(/index\.cjs$/, 'index.js')
const effector = path.join(path.dirname(require.resolve('effector')), 'effector.mjs')
export default defineConfig({
  ...base,
  resolve: { alias: [
    { find: /^@testing-library\/react$/, replacement: require.resolve('@testing-library/react') },
    { find: /^react$/, replacement: require.resolve('react') },
    ...['react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'react-dom/test-utils'].map(name => ({ find: new RegExp(`^${name}$`), replacement: require.resolve(name) })),
    { find: /^effector(?:\/effector\.mjs)?$/, replacement: effector },
    { find: /^effector-react$/, replacement: require.resolve('effector-react').replace(/effector-react\.cjs\.js$/, 'effector-react.mjs') },
    { find: /^@tanstack\/react-query$/, replacement: native },
    { find: /^@tanstack\/query-core$/, replacement: core },
    { find: /^@effector-tanstack-query\/core$/, replacement: path.join(root, 'packages/core/src/index.ts') },
  ] },
  test: { ...base.test, typecheck: { enabled: false }, coverage: { enabled: false } },
})
