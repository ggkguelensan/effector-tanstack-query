import { createStore, type Store } from 'effector'
import { expectTypeOf } from 'vitest'
import type { QueryObserverOptions, QueryKey, DefaultError } from '@tanstack/query-core'
import { todoOptions, type Todo } from '../fixtures/todo.qo'
import type { OptionsSource, SourceValue } from '../contracts'

declare function candidate<const S extends OptionsSource, F = unknown, E = DefaultError, FD = F, D = FD, const K extends QueryKey = QueryKey>(options: {
  source: S
  query: (source: SourceValue<S>) => QueryObserverOptions<F,E,FD,F,K>
  select?: (data: F) => D
}): Store<D | undefined>
const $id = createStore(1)
const result = candidate({
  source: $id,
  query: id => todoOptions({todoId: id}),
  select: todo => { expectTypeOf(todo).toEqualTypeOf<Todo>(); return todo.title },
})
expectTypeOf(result).toEqualTypeOf<Store<string | undefined>>()
const unselected = candidate({source: $id, query: id => todoOptions({todoId: id})})
expectTypeOf(unselected).toEqualTypeOf<Store<Todo | undefined>>()
const overridden = candidate({
  source: $id,
  query: (id: number) => ({...todoOptions({todoId:id}), select: todo => todo.id}),
  select: todo => { expectTypeOf(todo).toEqualTypeOf<Todo>(); return todo.title },
})
expectTypeOf(overridden).toEqualTypeOf<Store<string | undefined>>()
const selectedFactory = (id: number) => ({...todoOptions({todoId:id}), select: (todo: Todo) => todo.id})
const inherited = candidate({source:$id, query:selectedFactory})
expectTypeOf(inherited).toEqualTypeOf<Store<number|undefined>>()
const overrideSelected = candidate({source:$id, query:selectedFactory, select:todo => todo.title})
expectTypeOf(overrideSelected).toEqualTypeOf<Store<string|undefined>>()
// A portable selector lets the ordinary returned object keep its shape.
import { createQuery } from '../contracts'
const titleOf = (todo: Todo) => todo.title
const composed = createQuery({source:$id, query:id=>({...todoOptions({todoId:id}),select:titleOf})})
expectTypeOf(composed.$data).toEqualTypeOf<Store<string|undefined>>()
declare const optionalSelect: ((todo: Todo) => string) | undefined
const optionalOverride = candidate({source:$id, query:selectedFactory, select:optionalSelect})
// This passes today, but the declaration is too narrow: undefined inherits number.
expectTypeOf(optionalOverride).toEqualTypeOf<Store<string|undefined>>()
