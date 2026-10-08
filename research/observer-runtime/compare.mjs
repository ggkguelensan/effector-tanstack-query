import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('tsup'))('esbuild')
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import assert from 'node:assert/strict'

const root = process.cwd()
const baseline = 'ca64fedd309a271de044ee41428b2c16a6bc1b9d'
const output = path.join(root, 'packages/core/.cache/observer-runtime')
mkdirSync(output, { recursive: true })
const external = ['react', 'effector', 'effector-react', '@tanstack/query-core', '@tanstack/react-query']
const entry = (names) => `export {${names}} from './packages/core/src/index.ts'`
const entries = {
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
const probe = `
import {allSettled, createEvent, createStore, fork, sample, serialize} from 'effector'
import {QueryClient} from '@tanstack/query-core'
import {createQueries} from './packages/core/src/index.ts'
export async function run() {
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}})
 const changed=createEvent()
 const source=createStore([{id:1,label:'A'},{id:1,label:'B'}]).on(changed,(_,value)=>value)
 const family=createQueries(client,{name:'probe.family',source,query:item=>({queryKey:['duplicate',item.id],queryFn:async()=>10,select:n=>item.label+':'+n})})
 const scope=fork()
 await allSettled(family.prefetch,{scope})
 const duplicates=scope.getState(family.$data)
 await allSettled(family.mounted,{scope})
 await allSettled(changed,{scope,params:[{id:1,label:'B'},{id:1,label:'A'}]})
 const reordered=scope.getState(family.$data)
 const serialized=serialize(scope)
 await allSettled(family.unmounted,{scope})
 client.clear()
 return {duplicates,reordered,serialized}
}
`

const report = { baseline, measurements: {}, behavior: {} }
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
  const result = await compile(version, probe)
  const file = path.join(output, `${version}-probe.mjs`)
  writeFileSync(file, result.outputFiles[0].contents)
  report.behavior[version] = await (await import(pathToFileURL(file).href)).run()
}
report.deltas = Object.fromEntries(Object.keys(report.measurements.baseline).map(name => [name, {
  minified: report.measurements.candidate[name].minified - report.measurements.baseline[name].minified,
  gzip: report.measurements.candidate[name].gzip - report.measurements.baseline[name].gzip,
}]))
assert.deepEqual(report.behavior.baseline.duplicates, ['B:10', 'B:10'])
assert.deepEqual(report.behavior.candidate.duplicates, ['A:10', 'B:10'])
assert.deepEqual(report.behavior.baseline.reordered, ['A:10', 'A:10'])
assert.deepEqual(report.behavior.candidate.reordered, ['B:10', 'A:10'])
// Generated report: do not edit independently of this experiment.
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
