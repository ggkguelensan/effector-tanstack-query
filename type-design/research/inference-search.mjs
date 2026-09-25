import ts from '../../node_modules/typescript/lib/typescript.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const out = resolve(root, 'type-design/.generated/inference-search')
mkdirSync(out, { recursive: true })
const prelude = `
import { createStore, type Store } from 'effector'
import { expectTypeOf } from 'vitest'
import type { QueryObserverOptions, QueryKey, DefaultError, QueryFunction, DataTag } from '@tanstack/query-core'
import { todoOptions as nativeOptions, type Todo } from '../../fixtures/todo.qo'
import type { OptionsSource, SourceValue } from '../../contracts'
type Minimal<F,D> = { queryKey: readonly unknown[]; queryFn: () => Promise<F>; select?: (data:F)=>D }
const rawOptions = (todoId:number) => ({ queryKey: ['todos',todoId] as const, queryFn: async ():Promise<Todo>=>({id:todoId,title:'x'}) })
const $id = createStore(1)
type Raw<O> = O extends {queryFn?: infer Fn} ? Fn extends (...args:any[])=>infer R ? Awaited<R> : never : never
type Selected<O> = O extends {select:(...args:any[])=>infer D} ? D : Raw<O>
type Sel<F,D> = {select?:(data:F)=>D}
type Bivariant<P,R> = {bivarianceHack(p:P):R}['bivarianceHack']
`
const g = 'const S extends OptionsSource, F = unknown, D = F'
const p = 'SourceValue<S>'
const experiments = [
  ['baseline', g, `{source:S;query:(p:${p})=>OPT}`, 'D'],
  ['source_noinfer', g, `{source:S;query:(p:NoInfer<${p}>)=>OPT}`, 'D'],
  ['fixed_source', 'F = unknown, D = F', '{source:Store<number>;query:(p:number)=>OPT}', 'D'],
  ['bivariant', g, `{source:S;query:Bivariant<${p},OPT>}`, 'D'],
  ['method', g, `{source:S;query(p:${p}):OPT}`, 'D'],
  ['generic_param', g, `{source:S;query:<P extends ${p}>(p:P)=>OPT}`, 'D'],
  ['generic_default_param', g, `{source:S;query:<P extends ${p} = ${p}>(p:P)=>OPT}`, 'D'],
  ['generic_return', g, `{source:S;query:<R extends OPT>(p:${p})=>R}`, 'D'],
  ['intersection_void_first', g, `{source:S;query:((p:${p})=>void)&((p:${p})=>OPT)}`, 'D'],
  ['intersection_void_last', g, `{source:S;query:((p:${p})=>OPT)&((p:${p})=>void)}`, 'D'],
  ['intersection_never_param', g, `{source:S;query:((p:${p})=>OPT)&((p:never)=>OPT)}`, 'D'],
  ['union_callback', g, `{source:S;query:((p:${p})=>OPT)|OPT}`, 'D'],
  ['union_noarg', g, `{source:S;query:((p:${p})=>OPT)|(()=>OPT)}`, 'D'],
  ['return_intersection', g+', O extends object = object', `{source:S;query:(p:${p})=>O & OPT}`, 'D'],
  ['capture_context', g+', Q extends (p:'+p+')=>OPT = (p:'+p+')=>OPT', '{source:S;query:Q}', 'D'],
  ['capture_context_intersection', g+', Q extends (p:'+p+')=>object = (p:'+p+')=>object', `{source:S;query:Q & ((p:${p})=>OPT)}`, 'D'],
  ['capture_self', 'const S extends OptionsSource, O extends object', `{source:S;query:(p:${p})=>O & Sel<Raw<O>,unknown>}`, 'Selected<O>'],
  ['capture_self_noinfer', 'const S extends OptionsSource, O extends object', `{source:S;query:(p:${p})=>O & Sel<Raw<NoInfer<O>>,unknown>}`, 'Selected<O>'],
  ['mapped_return', g, `{source:S;query:(p:${p})=>{[K in keyof OPT]:OPT[K]}}`, 'D'],
  ['noinfer_select', g, `{source:S;query:(p:${p})=>Omit<OPT,'select'> & Sel<NoInfer<F>,D>}`, 'D'],
  ['intersection_select', g, `{source:S;query:(p:${p})=>OPT & Sel<F,D>}`, 'D'],
  ['tuple_source', 'P, F = unknown, D = F', '{source:Store<P>;query:(...p:[P])=>OPT}', 'D'],
  ['simple_source', 'P, F = unknown, D = F', '{source:Store<P>;query:(p:P)=>OPT}', 'D'],
  ['capture_key_tag', 'const S extends OptionsSource, F = unknown, D = F', `{source:S;query:(p:${p})=>{queryKey:DataTag<QueryKey,F>;select?:(data:F)=>D}}`, 'D'],
  ['return_two_inferences', g, `{source:S;query:((p:${p})=>Omit<OPT,'select'>) & ((p:${p})=>OPT)}`, 'D'],
  ['mapped_root', g, `{[K in 'source'|'query']:K extends 'source'?S:(p:${p})=>OPT}`, 'D'],
  ['generic_rest', g+`, A extends [${p}] = [${p}]`, '{source:S;query:(...args:A)=>OPT}', 'D'],
  ['generic_rest_fixed', 'F = unknown, D = F, A extends [number] = [number]', '{source:Store<number>;query:(...args:A)=>OPT}', 'D'],
  ['generic_rest_front', `const S extends OptionsSource, A extends [${p}], F = unknown, D = F`, '{source:S;query:(...args:A)=>OPT}', 'D'],
  ['generic_rest_simple', 'P, A extends [P], F = unknown, D = F', '{source:Store<P>;query:(...args:A)=>OPT}', 'D'],
  ['generic_rest_anchor', 'A extends [unknown], F = unknown, D = F', '{source:Store<A[0]>;query:(...args:A)=>OPT}', 'D'],
  ['generic_rest_callback', g, `{source:S;query:<A extends [${p}]>(...args:A)=>OPT}`, 'D'],
  ['capture_callback_self', 'const S extends OptionsSource, Q extends (p:'+p+')=>object', `{source:S;query:Q & ((p:${p})=>ReturnType<Q> & Sel<Raw<ReturnType<Q>>,unknown>)}`, 'Selected<ReturnType<Q>>'],
  ['capture_callback_self_noinfer', 'const S extends OptionsSource, Q extends (p:'+p+')=>object', `{source:S;query:Q & ((p:${p})=>ReturnType<Q> & Sel<Raw<NoInfer<ReturnType<Q>>>,unknown>)}`, 'Selected<ReturnType<Q>>'],
  ['capture_callable_loose', 'const S extends OptionsSource, Q extends (...p:never[])=>object', `{source:S;query:Q & ((p:${p})=>ReturnType<Q> & Sel<Raw<ReturnType<Q>>,unknown>)}`, 'Selected<ReturnType<Q>>'],
  ['reverse_mapped_return', 'const S extends OptionsSource, T extends {queryKey:unknown;queryFn:unknown;select:unknown}', `{source:S;query:(p:${p})=>{[K in keyof T]:K extends 'select'?(data:T['queryFn'])=>T[K]:K extends 'queryFn'?()=>Promise<T[K]>:T[K]}}`, "T['select']"],
  ['reverse_mapped_root', 'const T extends {source:OptionsSource;query:unknown}, F=unknown, D=F', "{[K in keyof T]:K extends 'query'?(p:SourceValue<T['source']>)=>OPT:T[K]}", 'D'],
  ['tuple_generics', 'const T extends [OptionsSource,unknown,unknown]', "{source:T[0];query:(p:SourceValue<T[0]>)=>Minimal<T[1],T[2]>}", 'T[2]'],
  ['any_negative_control', 'const S extends OptionsSource, D=unknown', `{source:S;query:(p:${p})=>Minimal<any,D>}`, 'D'],
]
const files = []
for (const [name, generics, signature, result] of experiments) {
  for (const kind of ['minimal','native']) {
    const opt = kind === 'minimal' ? 'Minimal<F,D>' : 'QueryObserverOptions<F,DefaultError,D,F,any>'
    const options = kind === 'minimal' ? 'rawOptions(id)' : 'nativeOptions({todoId:id})'
    const file = resolve(out, `${name}-${kind}.ts`)
    const content = prelude + `
declare function candidate<${generics}>(options:${signature.replaceAll('OPT',opt)}):Store<${result}|undefined>
const result = candidate({source:$id,query:id=>({...${options},select:todo=>{
    expectTypeOf(id).toEqualTypeOf<number>()
    expectTypeOf(todo).toEqualTypeOf<Todo>()
    // @ts-expect-error A selector must not silently receive any.
    todo.nonexistent
    return todo.title
  }})})
expectTypeOf(result).toEqualTypeOf<Store<string|undefined>>()
`
    writeFileSync(file, content)
    files.push(file)
  }
}
const config = ts.readConfigFile(resolve(root,'type-design/tsconfig.json'), ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(root,'type-design'))
const program = ts.createProgram(files,{...parsed.options,noUnusedLocals:false,noUnusedParameters:false})
const diagnostics = ts.getPreEmitDiagnostics(program)
const summaries=[]
for(const file of files){
  const ds=diagnostics.filter(d=>d.file?.fileName===file)
  const name=file.split('/').pop()
  summaries.push({name,errors:ds.map(d=>({code:d.code,line:d.file.getLineAndCharacterOfPosition(d.start).line+1,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))})
  console.log(`${ds.length ? 'FAIL '+ds.length : 'PASS'} ${name}`)
}
const extra = diagnostics.filter(d=>!d.file||!files.includes(d.file.fileName))
if(extra.length) console.log(ts.formatDiagnosticsWithColorAndContext(extra,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}))
writeFileSync(resolve(out,'results.json'),JSON.stringify(summaries,null,2))
