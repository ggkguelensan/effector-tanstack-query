import { createStore } from 'effector'
import type { Event, Store } from 'effector'
import { QueryClient, type InfiniteData } from '@tanstack/query-core'
import { expectTypeOf } from 'vitest'
import {
  createQuery,
  createInfiniteQuery,
  queryOptions,
  infiniteQueryOptions,
} from '../index'

type Todo = { id: number; title: string }
const $id = createStore(1)
const client = new QueryClient()
const todoOptions = ({ id }: { id: number }) =>
  queryOptions({
    queryKey: ['todos', id] as const,
    queryFn: async (): Promise<Todo> => ({ id, title: 'todo' }),
  })
const titleOptions = ({ id }: { id: number }) =>
  queryOptions({
    ...todoOptions({ id }),
    select: (todo) => todo.title,
  })
const direct = createQuery({
  source: { id: $id },
  query: todoOptions,
  select: (todo) => {
    expectTypeOf(todo).toEqualTypeOf<Todo>()
    return todo.title
  },
})
const composed = createQuery(client, {
  source: $id,
  query: (id) => todoOptions({ id }),
  select: (todo) => todo.title,
  placeholderData: (previous, previousQuery) => {
    expectTypeOf(previous).toEqualTypeOf<Todo | undefined>()
    expectTypeOf(previousQuery?.queryKey).toEqualTypeOf<
      readonly ['todos', number] | undefined
    >()
    return previous
  },
  staleTime: (query) => {
    expectTypeOf(query.state.data).toEqualTypeOf<Todo | undefined>()
    return 0
  },
  refetchOnMount: (query) => query.state.data?.id === 1,
  refetchOnWindowFocus: (query) => query.state.data?.id === 1,
  refetchOnReconnect: (query) => query.state.data?.id === 1,
  retryOnMount: (query) => query.state.data?.id === 1,
  refetchInterval: (query) => (query.state.data?.id === 1 ? false : 100),
  refetchIntervalInBackground: false,
})
expectTypeOf(direct.$data).toEqualTypeOf<Store<string | undefined>>()
expectTypeOf(composed.$data).toEqualTypeOf<Store<string | undefined>>()
expectTypeOf(composed.finished.success).toEqualTypeOf<Event<string>>()

const inherited = createQuery({ source: { id: $id }, query: titleOptions })
const undefinedSelect = createQuery(client, {
  source: { id: $id },
  query: titleOptions,
  select: undefined,
})
const replaced = createQuery({
  source: { id: $id },
  query: titleOptions,
  select: (todo) => todo.id,
})
expectTypeOf(inherited.$data).toEqualTypeOf<Store<string | undefined>>()
expectTypeOf(undefinedSelect.$data).toEqualTypeOf<Store<string | undefined>>()
expectTypeOf(replaced.$data).toEqualTypeOf<Store<number | undefined>>()
declare const optionalSelect: ((todo: Todo) => number) | undefined
const optional = createQuery({
  source: { id: $id },
  query: titleOptions,
  select: optionalSelect,
})
const explicitOptional = createQuery(client, {
  source: { id: $id },
  query: titleOptions,
  select: optionalSelect,
})
expectTypeOf(optional.$data).toEqualTypeOf<Store<string | number | undefined>>()
expectTypeOf(explicitOptional.$data).toEqualTypeOf<
  Store<string | number | undefined>
>()
expectTypeOf(optional.finished.success).toEqualTypeOf<Event<string | number>>()
const plain = createQuery({
  source: $id,
  query: (id) => ({
    queryKey: ['plain', id],
    queryFn: () => ({ id, title: 'todo' }),
  }),
  select: (todo) => todo.title,
})
expectTypeOf(plain.$data).toEqualTypeOf<Store<string | undefined>>()

const pageOptions = (id: number) =>
  infiniteQueryOptions({
    queryKey: ['pages', id] as const,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => ({ id, cursor: pageParam + 1 }),
    getNextPageParam: (page) => page.cursor,
    select: (data) => data.pages.map((page) => page.id),
  })
type Page = { id: number; cursor: number }
const pages = createInfiniteQuery({
  source: $id,
  query: pageOptions,
  select: (data) => {
    expectTypeOf(data).toEqualTypeOf<InfiniteData<Page, number>>()
    return data.pages.map((page) => String(page.id))
  },
  placeholderData: (previous) => {
    expectTypeOf(previous).toEqualTypeOf<
      InfiniteData<Page, number> | undefined
    >()
    return previous
  },
  staleTime: (query) => {
    expectTypeOf(query.state.data).toEqualTypeOf<
      InfiniteData<Page, number> | undefined
    >()
    return 0
  },
  refetchOnMount: (query) => !!query.state.data?.pages.length,
  refetchOnWindowFocus: (query) => !!query.state.data?.pages.length,
  refetchOnReconnect: (query) => !!query.state.data?.pages.length,
  retryOnMount: (query) => !!query.state.data?.pages.length,
  refetchInterval: (query) => (query.state.data?.pages.length ? false : 100),
})
const explicitPages = createInfiniteQuery(client, {
  source: { id: $id },
  query: ({ id }) => pageOptions(id),
  select: (data) => data.pages.length,
})
expectTypeOf(pages.$data).toEqualTypeOf<Store<string[] | undefined>>()
expectTypeOf(explicitPages.$data).toEqualTypeOf<Store<number | undefined>>()
expectTypeOf(pages.finished.success).toEqualTypeOf<Event<string[]>>()
const inheritedPages = createInfiniteQuery({ source: $id, query: pageOptions })
const undefinedPages = createInfiniteQuery(client, {
  source: $id,
  query: pageOptions,
  select: undefined,
})
expectTypeOf(inheritedPages.$data).toEqualTypeOf<Store<number[] | undefined>>()
expectTypeOf(undefinedPages.$data).toEqualTypeOf<Store<number[] | undefined>>()
declare const optionalPageSelect:
  | ((data: InfiniteData<Page, number>) => string)
  | undefined
const optionalPages = createInfiniteQuery({
  source: $id,
  query: pageOptions,
  select: optionalPageSelect,
})
const explicitOptionalPages = createInfiniteQuery(client, {
  source: $id,
  query: pageOptions,
  select: optionalPageSelect,
})
expectTypeOf(optionalPages.$data).toEqualTypeOf<
  Store<string | number[] | undefined>
>()
expectTypeOf(explicitOptionalPages.$data).toEqualTypeOf<
  Store<string | number[] | undefined>
>()

createQuery({
  source: { id: $id },
  query: titleOptions,
  // @ts-expect-error consumer selectors must accept raw query data
  select: (title: string) => title.length,
})
createQuery({
  // @ts-expect-error placeholders must contain raw data, even after select
  source: { id: $id },
  query: titleOptions,
  placeholderData: 'title',
})
createQuery({
  source: { id: $id },
  query: todoOptions,
  // @ts-expect-error only enabled and refetchInterval accept stores
  staleTime: createStore(100),
})
const invalid = { source: $id, query: pageOptions, gcTime: 100 }
// @ts-expect-error query-level settings belong in the factory, including variables
createInfiniteQuery(invalid)
// @ts-expect-error query-level settings belong in the factory
createQuery({ source: { id: $id }, query: todoOptions, retry: false })

// Annotated option objects can carry either selection state.
declare const configured: import('../index').CreateQueryFactoryOptions<
  { id: typeof $id },
  Todo,
  Error,
  number,
  readonly ['todos', number],
  string
>
const configuredQuery = createQuery(configured)
expectTypeOf(configuredQuery.$data).toEqualTypeOf<
  Store<string | number | undefined>
>()
