import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, symlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// Last master commit before factory support. Tests execute its implementation,
// rather than reproducing the new implementation's expected behavior.
const baseline = '08c41a7ce71d84c960b632ecab3b460af1557206'
const root = resolve('scripts/compat/.baseline')
const files = execFileSync(
  'git',
  [
    'ls-tree',
    '-r',
    '--name-only',
    baseline,
    '--',
    'packages/core/src',
    'packages/react/src',
  ],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
for (const file of files.filter((f) => !f.includes('/__tests__/'))) {
  const target = resolve(root, file)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, execFileSync('git', ['show', `${baseline}:${file}`]))
}
console.log(`Compatibility baseline: ${baseline}`)

for (const pkg of ['core', 'react']) {
  const link = resolve(root, 'packages', pkg, 'node_modules')
  if (!existsSync(link))
    symlinkSync(resolve('packages', pkg, 'node_modules'), link, 'dir')
}
