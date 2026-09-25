import { execFileSync, spawnSync } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
const requireCore = createRequire(resolve('packages/core/package.json'))
const coreTypes =
  process.env.QUERY_CORE_TYPES ??
  resolve(
    requireCore.resolve('@tanstack/query-core/package.json'),
    '../build/modern/index.d.ts',
  )
const compiler = process.env.COMPAT_TYPESCRIPT
  ? [`--package=typescript@${process.env.COMPAT_TYPESCRIPT}`, 'dlx', 'tsc']
  : ['exec', 'tsc']
const config = resolve('scripts/compat/.types.json')
try {
  const inference = []
  for (const [subject, fixture] of [
    ['.baseline/dist/index.d.ts', 'inline.types.ts'],
    ['../../packages/core/dist/index.d.ts', 'inline.types.ts'],
    ['../../packages/core/dist/index.d.ts', 'factory.types.ts'],
    ['../../packages/core/dist/index.d.ts', 'public-types.types.ts'],
    ['.baseline/dist/index.d.ts', 'infinite-inference.types.ts'],
    ['../../packages/core/dist/index.d.ts', 'infinite-inference.types.ts'],
  ]) {
    writeFileSync(
      config,
      JSON.stringify({
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          noEmit: true,
          paths: {
            '@subject/core': [resolve('scripts/compat', subject)],
            '@baseline/core': [
              resolve('scripts/compat/.baseline/dist/index.d.ts'),
            ],
            '@tanstack/query-core': [coreTypes],
          },
        },
        files: [fixture],
      }),
    )
    console.log(`Checking ${fixture} against ${subject} and ${coreTypes}`)
    if (fixture === 'infinite-inference.types.ts') {
      const result = spawnSync('pnpm', [...compiler, '-p', config], {
        encoding: 'utf8',
      })
      inference.push({ status: result.status, output: result.stdout })
    } else {
      execFileSync('pnpm', [...compiler, '-p', config], { stdio: 'inherit' })
    }
  }
  assert.deepEqual(
    inference[1],
    inference[0],
    'Infinite inference must match the pre-PR declarations',
  )
  if (inference[0].status !== 0)
    console.log(
      'Pre-existing infinite pageParam inference limitation reproduced identically on both versions.',
    )
} finally {
  rmSync(config, { force: true })
}
