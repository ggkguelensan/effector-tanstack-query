import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, symlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(here, '..')
const generated = resolve(here, '.generated')
mkdirSync(generated, { recursive: true })
// Resolve the dependencies already installed by the workspace, without adding
// packages, importing React into core, or changing a lockfile.
const tanstack = resolve(here, 'node_modules/@tanstack')
mkdirSync(tanstack, { recursive: true })
for (const [name, workspace] of [['query-core', 'core'], ['react-query', 'react']]) {
  const link = resolve(tanstack, name)
  if (!existsSync(link)) symlinkSync(realpathSync(resolve(root, `packages/${workspace}/node_modules/@tanstack/${name}`)), link, 'dir')
}

// Re-run the actual existing type tests against the proposed overloads.
// Runtime implementations and package exports remain unchanged.
const core = readFileSync(resolve(root, 'packages/core/src/__tests__/types.test-d.ts'), 'utf8')
  .replace(/from '\.\.\/(createQuery|createInfiniteQuery|createMutation)'/g, "from '../contracts'")
  .replace(/from '\.\.\/(?!contracts')([^']+)'/g, "from '../../packages/core/src/$1'")
writeFileSync(resolve(generated, 'legacy-core.test-d.ts'), core)
writeFileSync(resolve(generated, 'core.ts'), [
  "export * from '../../packages/core/src/index'",
  "export { createQuery, createInfiniteQuery, createMutation } from '../contracts'",
].join('\n') + '\n')
const react = readFileSync(resolve(root, 'packages/react/src/__tests__/types.test-d.ts'), 'utf8')
  .replace(/from '@effector-tanstack-query\/core'/g, "from './core'")
  .replace(/from '\.\.'/g, "from '../../packages/react/src/index'")
writeFileSync(resolve(generated, 'legacy-react.test-d.ts'), react)

// Trial repair for the existing incompatibility with a registered QueryKey.
// Keep it projected into .generated so runtime/public package files stay intact.
const keyAwareTypes = readFileSync(resolve(root, 'packages/core/src/types.ts'), 'utf8')
  .replace(/export type EffectorQueryKey = ReadonlyArray<[\s\S]*?\n>/,
    'type ReactiveKey<K extends QueryKey> = { readonly [P in keyof K]: StoreOrValue<K[P]> }\nexport type EffectorQueryKey = ReactiveKey<QueryKey>')
  .replaceAll('TQueryKey extends ReadonlyArray<unknown>', 'TQueryKey extends QueryKey')
  .replaceAll('= ReadonlyArray<unknown>,', '= QueryKey,')
writeFileSync(resolve(generated, 'key-aware-types.ts'), keyAwareTypes)
writeFileSync(resolve(generated, 'key-aware-contracts.ts'),
  readFileSync(resolve(here, 'contracts.ts'), 'utf8').replace("'../packages/core/src/types'", "'./key-aware-types'"))
const registeredKeys = readFileSync(resolve(here, 'registered-keys.repro.ts'), 'utf8')
  .replace("'./contracts'", "'./key-aware-contracts'")
  .replaceAll("'./helpers/", "'../helpers/")
writeFileSync(resolve(generated, 'registered-keys-fixed.test-d.ts'), registeredKeys + `
const inline = createQuery({ queryKey: ['app', $id], queryFn: async () => 1 })
expectTypeOf(inline.$data).toEqualTypeOf<Store<number | undefined>>()
// @ts-expect-error Registered keys also constrain inline queries.
createQuery({ queryKey: ['wrong', $id], queryFn: async () => 1 })
// @ts-expect-error Registered keys also constrain factory queries.
createQuery({ source: $id, query: id => ({ queryKey: ['wrong', id], queryFn: async () => 1 }) })
`)

const tsc = resolve(root, 'node_modules/typescript/bin/tsc')
const usePathTsc = process.argv.includes('--path-tsc')
const compiler = usePathTsc ? 'tsc' : process.execPath
const compilerArgs = usePathTsc ? [] : [tsc]
const version = spawnSync(compiler, [...compilerArgs, '--version'], { encoding: 'utf8' })
console.log(version.stdout.trim())
const checks = [
  ['main contract + existing core/react type tests', 'tsconfig.json'],
  ['registered defaults', 'tsconfig.registered.json'],
  ['registered key compatibility repair', 'tsconfig.registered-keys-fixed.json'],
  ['declaration emit', 'tsconfig.declarations.json'],
]
for (const [label, config] of checks) {
  console.log(`Checking ${label}`)
  const result = spawnSync(compiler, [...compilerArgs, '-p', resolve(here, config), '--pretty', 'false'], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// Known baseline failure, asserted independently from the passing contract suite.
const baseline = spawnSync(compiler,
  [...compilerArgs, '-p', resolve(here, 'tsconfig.registered-keys.json'), '--pretty', 'false'],
  { cwd: root, encoding: 'utf8' })
const errors = (baseline.stdout + baseline.stderr).split('\n').filter(line => /error TS\d+:/.test(line))
if (baseline.status !== 2 || errors.length !== 5 || !errors.every(line => line.includes('packages/core/src/types.ts') && line.includes('error TS2344:'))) {
  console.error('Registered-key baseline changed; review and update the recorded finding.')
  console.error(baseline.stdout, baseline.stderr)
  process.exit(1)
}
console.log('Confirmed known registered-key failure: 5 TS2344 diagnostics in legacy types; projected repair passes.')
