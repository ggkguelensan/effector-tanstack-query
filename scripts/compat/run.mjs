import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const run = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })
run('node', ['scripts/compat/prepare.mjs'])
run('pnpm', [
  'exec',
  'tsup',
  '--config',
  'scripts/compat/baseline-build.config.ts',
])
const requireRoot = createRequire(resolve('package.json'))
const versions = (
  process.env.QUERY_VERSIONS ?? '5.0.0,5.40.0,5.80.0,5.100.10'
).split(',')
const scratch = mkdtempSync(resolve(tmpdir(), 'etq-compat-'))
try {
  for (const version of versions) {
    console.log(`\n=== TanStack Query ${version} ===`)
    const folder = resolve(scratch, version)
    mkdirSync(folder, { recursive: true })
    const packed = JSON.parse(
      execFileSync(
        'npm',
        [
          'pack',
          `@tanstack/query-core@${version}`,
          '--json',
          '--pack-destination',
          folder,
        ],
        { encoding: 'utf8' },
      ),
    )[0]
    run('tar', ['-xzf', resolve(folder, packed.filename), '-C', folder])
    const pkg = resolve(folder, 'package')
    const env = {
      QUERY_CORE_PATH: resolve(pkg, 'build/modern/index.js'),
      QUERY_CORE_TYPES: resolve(pkg, 'build/modern/index.d.ts'),
    }
    run(
      'pnpm',
      ['exec', 'vitest', 'run', '--config', 'scripts/compat/vite.config.ts'],
      env,
    )
    run('node', ['scripts/compat/check-types.mjs'], env)

    // Exercise the shipped JS too. An unavailable named import can break even
    // an old inline-only app merely importing the new package entry point.
    const consumer = resolve(folder, 'consumer')
    mkdirSync(resolve(consumer, 'node_modules/@tanstack'), { recursive: true })
    symlinkSync(
      pkg,
      resolve(consumer, 'node_modules/@tanstack/query-core'),
      'dir',
    )
    symlinkSync(
      dirname(requireRoot.resolve('effector/package.json')),
      resolve(consumer, 'node_modules/effector'),
      'dir',
    )
    cpSync(resolve('packages/core/dist'), resolve(consumer, 'dist'), {
      recursive: true,
    })
    writeFileSync(resolve(consumer, 'package.json'), '{"type":"module"}')
    writeFileSync(
      resolve(consumer, 'smoke.mjs'),
      `
      import assert from 'node:assert/strict'
      import { createRequire } from 'node:module'
      import { fork, allSettled } from 'effector'
      import { QueryClient } from '@tanstack/query-core'
      const require = createRequire(import.meta.url)
      for (const api of [await import('./dist/index.js'), require('./dist/index.cjs')]) {
        const client = new QueryClient()
        const model = api.createQuery(client, { name: 'smoke', queryKey: ['inline'], queryFn: () => 7 })
        await allSettled(model.prefetch, { scope: fork() })
        assert.equal(client.getQueryData(['inline']), 7)
        const options = api.queryOptions({ queryKey: ['factory'], queryFn: () => 8 })
        assert.equal(await client.fetchQuery(options), 8)
        client.clear()
      }
      console.log('Built ESM and CJS entry points passed')
    `,
    )
    run('node', [resolve(consumer, 'smoke.mjs')])
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
