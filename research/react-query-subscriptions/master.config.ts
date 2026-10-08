import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import base from '../../packages/react/vite.config'

const root = fileURLToPath(new URL('../../', import.meta.url))
export default defineConfig({
  ...base,
  plugins: [{
    name: 'actual-pre-pr-source',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0]!
      if (!file.startsWith(path.join(root, 'packages/')) || !file.endsWith('.ts') || file.includes('/__tests__/')) return
      if (!/\/packages\/(core|react)\/src\//.test(file)) return
      return execFileSync('git', ['show', `08c41a7:${path.relative(root, file)}`], { cwd: root, encoding: 'utf8' })
    },
  }, ...(base.plugins ?? [])],
  test: { ...base.test, typecheck: { enabled: false }, coverage: { enabled: false } },
})
