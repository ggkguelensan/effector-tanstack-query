import { createStore, type Store } from 'effector'
import { expectTypeOf } from 'vitest'
import type { QueryObserverOptions, QueryKey, DefaultError } from '@tanstack/query-core'
import { todoOptions, type Todo } from '../fixtures/todo.qo'
import type { OptionsSource, SourceValue } from '../contracts'

declare function staged<const S extends OptionsSource>(source:S): <F = unknown, E = DefaultError, D = F, const K extends QueryKey = QueryKey>(options:{query:(source: SourceValue<S>) => QueryObserverOptions<F,E,D,F,K>}) => Store<D|undefined>
const $id = createStore(1)
const stagedResult = staged($id)({
  query: id => ({...todoOptions({todoId:id}),select: todo => {
    expectTypeOf(todo).toEqualTypeOf<Todo>()
    return todo.title
  }}),
})
expectTypeOf(stagedResult).toEqualTypeOf<Store<string|undefined>>()

declare function top<const S extends OptionsSource, F = unknown, E = DefaultError, FD = F, D = FD, const K extends QueryKey = QueryKey>(options:{
 source:S
 query:(source:SourceValue<S>)=>QueryObserverOptions<F,E,FD,F,K>
 select?:(data:NoInfer<F>)=>D
}): Store<D|undefined>
const reordered = top({
  select: todo => {expectTypeOf(todo).toEqualTypeOf<Todo>();return todo.title},
  query: id => todoOptions({todoId:id}),
  source: $id,
})
expectTypeOf(reordered).toEqualTypeOf<Store<string|undefined>>()

// Capture options first; derive selector input from the captured object.
type Raw<O> = O extends {queryFn?: infer Q} ? Q extends (...args:any[])=>infer R ? Awaited<R> : never : never
// Full validation intentionally omitted in this minimal inference experiment.
declare function captured<const S extends OptionsSource, O extends object, D=Raw<O>>(options:{
 source:S
 query:(source:SourceValue<S>)=>O
 select?:(data:Raw<NoInfer<O>>)=>D
}):Store<D|undefined>
const capturedResult=captured({
 select:todo=>{expectTypeOf(todo).toEqualTypeOf<Todo>();return todo.title},
 query:id=>todoOptions({todoId:id}),
 source:$id,
})
expectTypeOf(capturedResult).toEqualTypeOf<Store<string|undefined>>()
