import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('tsup'))('esbuild')
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const baseline = 'ca64fedd309a271de044ee41428b2c16a6bc1b9d'
const output = path.join(root, 'packages/core/.cache/observer-runtime')
mkdirSync(output, { recursive: true })
const external = ['react', 'effector', 'effector-react', '@tanstack/query-core', '@tanstack/react-query']
const entry = (names) => `export {${names}} from './packages/core/src/index.ts'`
const entries = {
  react: "export * from './packages/react/src/index.ts'",
  core: "export * from './packages/core/src/index.ts'",
  all: "export * from './packages/core/src/index.ts'; export * from './packages/react/src/index.ts'",
  query: entry('createQuery'),
  infinite: entry('createInfiniteQuery'),
  mutation: entry('createMutation'),
  family: entry('createQueries'),
  suspense: entry('createQuery,createInfiniteQuery') + ";export {useSuspenseQuery,useSuspenseInfiniteQuery,useSuspenseQueries} from './packages/react/src/index.ts'",
}
function revisionPlugin(version) {
  return { name: 'revision', setup(builder) {
    builder.onResolve({ filter: /^@effector-tanstack-query\/core$/ }, () => ({ path: path.join(root, 'packages/core/src/index.ts') }))
    builder.onLoad({ filter: /\/packages\/(core|react)\/src\/.*\.ts$/ }, ({ path: file }) => ({
      contents: version === 'baseline'
        ? execFileSync('git', ['show', `${baseline}:${path.relative(root, file)}`], { encoding: 'utf8' })
        : readFileSync(file, 'utf8'),
      loader: 'ts',
    }))
  } }
}
async function compile(version, contents, includeQueryCore = false) {
  return build({ stdin: { contents, resolveDir: root, sourcefile: 'experiment.ts', loader: 'ts' }, bundle: true, minify: true,
    write: false, format: 'esm', target: 'es2020', external: includeQueryCore ? external.filter(name => name !== '@tanstack/query-core') : external, plugins: [revisionPlugin(version)] })
}

const report = { baseline, measurements: {} }
for (const version of ['baseline', 'candidate']) {
  report.measurements[version] = {}
  for (const [name, contents] of Object.entries(entries)) {
    const result = await compile(version, contents)
    const code = result.outputFiles[0].contents
    report.measurements[version][name] = { minified: code.length, gzip: gzipSync(code).length }
  }
  for (const name of ['family', 'all']) {
    const result = await compile(version, entries[name], true)
    const code = result.outputFiles[0].contents
    report.measurements[version][name + 'WithQueryCore'] = { minified: code.length, gzip: gzipSync(code).length }
  }

}
report.deltas = Object.fromEntries(Object.keys(report.measurements.baseline).map(name => [name, {
  minified: report.measurements.candidate[name].minified - report.measurements.baseline[name].minified,
  gzip: report.measurements.candidate[name].gzip - report.measurements.baseline[name].gzip,
}]))
// Generated report: do not edit independently of this experiment.
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
