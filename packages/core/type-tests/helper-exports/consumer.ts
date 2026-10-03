import { expectTypeOf } from 'vitest'
import { createStore, type Store } from 'effector'
import { QueryClient, type InfiniteData } from '@tanstack/query-core'
import { createQuery, createInfiniteQuery } from '@effector-tanstack-query/core'
import { todoOptions, pageOptions, initialTodoOptions, skippedTodoOptions, initialPageOptions, skippedPageOptions } from './library.js'

const client = new QueryClient()
const query = createQuery({ source: createStore(1), query: todoOptions })
const pages = createInfiniteQuery({ source: createStore(1), query: pageOptions })
expectTypeOf(query.$data).toEqualTypeOf<Store<string | undefined>>()
expectTypeOf(pages.$data).toEqualTypeOf<Store<number[] | undefined>>()
expectTypeOf(todoOptions(1).queryKey[1]).toEqualTypeOf<number>()
expectTypeOf(client.getQueryData(todoOptions(1).queryKey)).toEqualTypeOf<
  { id: number; title: string } | undefined
>()
expectTypeOf(client.fetchInfiniteQuery(pageOptions(1))).toEqualTypeOf<
  Promise<InfiniteData<{ id: number; next: number }, { after: number }>>
>()
// @ts-expect-error select does not change the raw cache type
client.setQueryData(todoOptions(1).queryKey, 'selected title')

expectTypeOf(client.getQueryData(initialTodoOptions(1).queryKey)).toEqualTypeOf<
  { id: number; title: string } | undefined
>()
expectTypeOf(client.getQueryData(skippedTodoOptions(1).queryKey)).toEqualTypeOf<
  { id: number; title: string } | undefined
>()
expectTypeOf(client.getQueryData(initialPageOptions(1).queryKey)).toEqualTypeOf<
  InfiniteData<{ id: number; next: number }> | undefined
>()
expectTypeOf(client.getQueryData(skippedPageOptions(1).queryKey)).toEqualTypeOf<
  InfiniteData<{ id: number; next: number }> | undefined
>()
