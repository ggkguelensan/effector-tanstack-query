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
