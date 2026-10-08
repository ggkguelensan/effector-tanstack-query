import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const directory = path.resolve('.cache/react-query-subscriptions')
const profiles = [
  { name: 'PR18', root: directory, forms: ['factory', 'inline'], react: '19.2.5', query: '5.100.10' },
  { name: 'pre-PR master 08c41a7', root: path.join(directory, 'master'), forms: ['inline'], react: '19.2.5', query: '5.100.10' },
  { name: 'Ticketon dependency profile', root: path.join(directory, 'ticketon'), forms: ['factory', 'inline'], react: '18.3.1', query: '5.100.11' },
]
const read = (profile, form, mode) => JSON.parse(readFileSync(path.join(profile.root, `${form}-${mode}.json`), 'utf8'))
const phases = ['sameData:start', 'sameData:finish', 'titleChanged', 'idChanged', 'error:start', 'error:finish']
const reference = read(profiles[0], 'factory', 'normal').committedRenders
const summary = {
  generatedBy: 'node research/react-query-subscriptions/summarize.mjs; do not edit independently',
  effector: '23.4.4', effectorReact: '23.3.0',
  controls: 'One client, one key, warmed cache, stable data reference on identical refetch, two controlled network requests, no parent rerenders',
  profiles: [],
  committedUpdates: Object.fromEntries(phases.map(phase => [phase, reference[phase]])),
}
for (const profile of profiles) {
  for (const form of profile.forms) {
    const normal = read(profile, form, 'normal'), strict = read(profile, form, 'strict')
    assert.deepEqual(normal.committedRenders, reference)
    assert.deepEqual(strict.committedRenders, reference)
    assert.equal(strict.renderPasses['sameData:start'].adapterData, 2)
    summary.profiles.push({ name: profile.name, form, react: profile.react, query: profile.query,
      strictMode: 'Same committed updates; render-function calls double for updates in development' })
  }
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n')
console.log('All dependency/form/StrictMode profiles match; generated results.json')
