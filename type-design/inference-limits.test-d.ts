// Executable documentation of the mismatches found before runtime changes.
// These assertions must change deliberately when the corresponding issue is fixed.
import { it, expectTypeOf } from 'vitest'
import { createStore } from 'effector'
import type { Store } from 'effector'
import { QueryClient } from '@tanstack/query-core'
import type { InfiniteData } from '@tanstack/query-core'
import { useInfiniteQuery, infiniteQueryOptions as nativeInfiniteQueryOptions } from '@tanstack/react-query'
import { createQuery, createInfiniteQuery, createMutation } from './contracts'
import { createMutation as legacyCreateMutation } from '../packages/core/src/createMutation'
import { useMutation as legacyUseMutation } from '../packages/react/src/index'
import { queryOptions } from './helpers/queryOptions'
import { infiniteQueryOptions } from './helpers/infiniteQueryOptions'
import { todoOptions, type Todo } from './fixtures/todo.qo'
import { updateTodoOptions } from './fixtures/todo.mo'

const $id = createStore(1)

it('requires a contextual helper or an annotation for callbacks in a raw mutation object', () => {
  createMutation({ source: $id, mutation: id => ({
    mutationFn: async (title: string) => ({ id, title }),
    // @ts-expect-error The raw returned object has no contextual type for this callback.
    onSuccess: data => { void data },
  }) })
})

it('records contextual inference loss in a raw object returned by an unannotated callback', () => {
  createQuery({ source: $id, query: id => ({
    ...todoOptions({ todoId: id }),
    select: data => {
      expectTypeOf(data).toEqualTypeOf<unknown>()
      // @ts-expect-error Desired data.title needs Todo; contextual inference currently gives unknown.
      return data.title
    },
  }) })
  // Wrapping the expression in the standard options helper restores inference.
  const good = createQuery({ source: $id, query: id => queryOptions({
    ...todoOptions({ todoId: id }),
    select: data => {
      expectTypeOf(data).toEqualTypeOf<Todo>()
      return data.title
    },
  }) })
  expectTypeOf(good.$data).toEqualTypeOf<Store<string | undefined>>()
})

it('records upstream pageParams widening in helper-selected data and cache tags', () => {
  const definition = {
    queryKey: ['pages'], initialPageParam: 0,
    queryFn: async ({ pageParam }: { pageParam: number }) => ({ next: pageParam + 1 }),
    getNextPageParam: (last: { next: number }) => last.next,
  }
  const native = nativeInfiniteQueryOptions(definition)
  const local = infiniteQueryOptions(definition)
  const client = new QueryClient()
  // The upstream helper defaults TData/DataTag to InfiniteData<Page, unknown>.
  expectTypeOf(useInfiniteQuery(native).data).toEqualTypeOf<InfiniteData<{ next: number }> | undefined>()
  expectTypeOf(client.getQueryData(native.queryKey)).toEqualTypeOf<InfiniteData<{ next: number }> | undefined>()
  expectTypeOf(client.getQueryData(local.queryKey)).toEqualTypeOf<InfiniteData<{ next: number }> | undefined>()
  expectTypeOf(createInfiniteQuery({ source: $id, query: () => native }).$data)
    .toEqualTypeOf<Store<InfiniteData<{ next: number }> | undefined>>()
  // Fetching still knows the page param from the option input.
  expectTypeOf(client.fetchInfiniteQuery(local)).toEqualTypeOf<Promise<InfiniteData<{ next: number }, number>>>()
})

it('records loss of rollback context in the existing MutationResult type', () => {
  const mutation = legacyCreateMutation(updateTodoOptions({ todoId: 1 }))
  mutation.mutateWith({ variables: { title: 'new' }, onError: (_error, _variables, rollback) => {
    expectTypeOf(rollback).toEqualTypeOf<unknown>()
    // @ts-expect-error The current result omits TOnMutateResult from MutateOptions.
    rollback?.previousTitle
  } })
  const improved = createMutation({ source: { todoId: $id }, mutation: updateTodoOptions })
  // @ts-expect-error Core and React result generics must be extended in the same change.
  legacyUseMutation(improved)
  improved.mutateWith({ variables: { title: 'new' }, onError: (_error, _variables, rollback) => {
    expectTypeOf(rollback).toEqualTypeOf<{ previousTitle: string } | undefined>()
  } })
})
