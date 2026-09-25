// Instrument a COPY of TS 5.9, never the installed compiler. This is explanatory
// evidence about the inference algorithm, not a compiler fix or a product change.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const compilerPath = require.resolve('../../node_modules/typescript/lib/typescript.js')
const out = resolve(root, 'type-design/.generated/inference-search')
mkdirSync(out, { recursive: true })
const before = readFileSync(compilerPath, 'utf8')
const target = `          inference.isFixed = true;`
if (before.split(target).length !== 2) throw new Error('Compiler source changed; inspect instrumentation site.')
const after = before.replace('function inferTypeArguments(node, signature, args, checkMode, context) {', `function inferTypeArguments(node, signature, args, checkMode, context) {
    context.__researchCall = node.getText().slice(0, 80);
`).replace(target, `
          if (context.signature?.declaration?.name?.escapedText === 'nested' && context.__researchCall) {
            console.log(JSON.stringify({
              call: context.__researchCall,
              parameter: inference.typeParameter.symbol.escapedName,
              candidates: (inference.candidates || []).map(t => typeToString(t)),
              contraCandidates: (inference.contraCandidates || []).map(t => typeToString(t))
            }));
          }
` + target)
const copy = resolve(out, 'instrumented-typescript.cjs')
writeFileSync(copy, after)
const ts = require(copy)
const configFile = resolve(root, 'type-design/research/tsconfig.minimal.json')
const config = ts.readConfigFile(configFile, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configFile))
const host = ts.createCompilerHost(parsed.options)
host.getDefaultLibLocation = () => dirname(compilerPath)
host.getDefaultLibFileName = opts => resolve(dirname(compilerPath), ts.getDefaultLibFileName(opts))
const program = ts.createProgram(parsed.fileNames, parsed.options, host)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) {
  console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}))
  process.exit(1)
}
