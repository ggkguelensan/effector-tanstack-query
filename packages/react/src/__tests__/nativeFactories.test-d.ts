import { expectTypeOf } from 'vitest'
import { createStore } from 'effector'
import type { Store } from 'effector'
import {
  QueryClient,
  queryOptions,
  infiniteQueryOptions,
  useQuery as useNativeQuery,
} from '@tanstack/react-query'
import {
  createQuery,
  createInfiniteQuery,
  queryOptions as coreQueryOptions,
} from '@effector-tanstack-query/core'
import { useQuery, useSuspenseQuery, useInfiniteQuery } from '../index'

const $id = createStore(1)
const options = (id: number) =>
  queryOptions({
    queryKey: ['native', id],
    queryFn: async () => ({ id, title: 'todo' }),
  })
const query = createQuery({ source: $id, query: options })
expectTypeOf(query.$data).toEqualTypeOf<
  Store<{ id: number; title: string } | undefined>
>()
expectTypeOf(useQuery(query).data).toEqualTypeOf<
  { id: number; title: string } | undefined
>()
expectTypeOf(useSuspenseQuery(query).data).toEqualTypeOf<{
  id: number
  title: string
}>()
expectTypeOf(new QueryClient().getQueryData(options(1).queryKey)).toEqualTypeOf<
  { id: number; title: string } | undefined
>()

const selected = createQuery({
  source: $id,
  query: (id: number) => ({
    ...options(id),
    select: (todo) => todo.title,
    enabled: id > 0,
  }),
})
expectTypeOf(useQuery(selected).data).toEqualTypeOf<string | undefined>()
const coreOptions = coreQueryOptions({ queryKey: ['core'], queryFn: () => 1 })
expectTypeOf(useNativeQuery(coreOptions).data).toEqualTypeOf<
  number | undefined
>()

const infinite = createInfiniteQuery({
  source: $id,
  query: (id) =>
    infiniteQueryOptions({
      queryKey: ['native-pages', id],
      initialPageParam: 0,
      queryFn: ({ pageParam }) => ({ next: pageParam + 1 }),
      getNextPageParam: (page) => page.next,
      select: (data) => data.pages.map((page) => page.next),
    }),
})
expectTypeOf(useInfiniteQuery(infinite).data).toEqualTypeOf<
  number[] | undefined
>()

// Native factories retain raw input types for consumer-level overrides.
const consumer = createQuery({
  source: $id,
  query: (id) => options(id),
  select: (todo) => todo.title,
  placeholderData: (previous) => previous,
})
expectTypeOf(useQuery(consumer).data).toEqualTypeOf<string | undefined>()
expectTypeOf(useSuspenseQuery(consumer).data).toEqualTypeOf<string>()
const nativePages = (id: number) =>
  infiniteQueryOptions({
    queryKey: ['native-consumer-pages', id],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => ({ id, cursor: pageParam }),
    getNextPageParam: (page) => page.cursor + 1,
    select: (data) => data.pages.length,
  })
const consumerPages = createInfiniteQuery({
  source: $id,
  query: (id) => nativePages(id),
  select: (data) => data.pages.map((page) => page.id),
})
expectTypeOf(useInfiniteQuery(consumerPages).data).toEqualTypeOf<
  number[] | undefined
>()
