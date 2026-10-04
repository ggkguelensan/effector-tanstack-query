import { createStore } from 'effector'
import type { Store } from 'effector'
import { expectTypeOf } from 'vitest'
import type { InfiniteData, QueryObserverOptions } from '@tanstack/query-core'
import {
  createQuery,
  createInfiniteQuery,
  createQueries,
  createMutation,
  queryOptions,
  infiniteQueryOptions,
} from '../index'
import type { QueryResult, InfiniteQueryResult, MutationResult } from '../index'
import { resolveQueryOptions } from '../resolve'
import type {
  QueryObserverSnapshot,
  CreateBaseQueryConfig,
} from '../createBaseQuery'
import type { QueryObserver } from '@tanstack/query-core'

type Raw = { id: number }
type Key = readonly ['contracts', number]
const source = createStore(1)

const query = createQuery({
  source,
  query: (id) =>
    queryOptions({
      queryKey: ['contracts', id] as const,
      queryFn: async (): Promise<Raw> => ({ id }),
      select: (raw) => String(raw.id),
    }),
})
const observer = query.$observer.getState()!
expectTypeOf(observer.getCurrentQuery().state.data).toEqualTypeOf<
  Raw | undefined
>()
expectTypeOf(observer.getCurrentResult().data).toEqualTypeOf<
  string | undefined
>()
expectTypeOf(observer.options.queryKey).toEqualTypeOf<Key>()
// @ts-expect-error selected data does not replace the native cache data
const selectedCache: string | undefined = observer.getCurrentQuery().state.data

const inline = createQuery({
  queryKey: ['contracts', source],
  queryFn: () => 1,
})
expectTypeOf(inline.$observer.getState()!.options.queryKey).toEqualTypeOf<Key>()
class Failure extends Error {
  readonly code = 'custom'
}
const contextualError: QueryResult<string, Failure> = createQuery({
  queryKey: ['contextual-error'],
  queryFn: () => 'ok',
})
// @ts-expect-error a result annotation cannot turn raw numbers into selected strings
const contextualData: QueryResult<string> = createQuery({
  queryKey: ['contextual-data'],
  queryFn: () => 1,
})
void [contextualError, contextualData]
const view: QueryResult<string> = query
const restored: ReturnType<typeof createQuery<Raw, Error, string>> = view

const pages = createInfiniteQuery({
  source,
  query: (id) =>
    infiniteQueryOptions({
      queryKey: ['contracts', id] as const,
      initialPageParam: 0,
      queryFn: ({ pageParam }: { pageParam: number }): Raw => ({
        id: id + pageParam,
      }),
      getNextPageParam: (_last, _all, previous) => previous + 1,
      select: (data) => data.pages.map((raw) => raw.id).join(','),
    }),
})
expectTypeOf(
  pages.$observer.getState()!.getCurrentQuery().state.data,
).toEqualTypeOf<InfiniteData<Raw, number> | undefined>()
expectTypeOf(pages.$data).toEqualTypeOf<Store<string | undefined>>()
const pageView: InfiniteQueryResult<string, Error, number> = pages
const restoredPages: ReturnType<
  typeof createInfiniteQuery<Raw, Error, number, string>
> = pageView

createQueries<number, Raw, Error, string, Key>({
  source: createStore<ReadonlyArray<number>>([1]),
  query: (id) => ({
    queryKey: ['contracts', id],
    queryFn: (): Raw => ({ id }),
    select: (raw) => String(raw.id),
  }),
  refetchOnWindowFocus: (nativeQuery) => {
    expectTypeOf(nativeQuery.state.data).toEqualTypeOf<Raw | undefined>()
    expectTypeOf(nativeQuery.queryKey).toEqualTypeOf<Key>()
    return false
  },
})

const mutation = createMutation({
  mutationFn: async (id: number) => String(id),
  onMutate: (id) => ({ previous: id }),
})
mutation.mutateWith({
  variables: 1,
  onSuccess: (_data, _variables, context) => {
    expectTypeOf(context).toEqualTypeOf<{ previous: number } | undefined>()
  },
})
// @ts-expect-error per-call callbacks retain the onMutate result type
mutation.mutateWith({
  variables: 1,
  onSuccess: (_data, _variables, context: string) => {
    void context
  },
})
const mutationView: MutationResult<string, Error, number> = mutation

type Native = QueryObserverOptions<Raw, Error, string, Raw, Key>
const binding = resolveQueryOptions<Native, typeof source>({
  source,
  query: (id) => ({
    queryKey: ['contracts', id],
    queryFn: (): Raw => ({ id }),
    select: (raw) => String(raw.id),
  }),
})
const current = binding.$options.getState()
binding.update(
  // @ts-expect-error update must not accept an observer with different raw data
  { queryKey: ['contracts', 1], queryFn: () => ({ wrong: true }) },
  current,
  true,
)
resolveQueryOptions({
  source,
  // @ts-expect-error callback input must match the resolved source
  query: (value: string) => ({ queryKey: ['wrong'], queryFn: () => value }),
})

const intervalBinding = resolveQueryOptions<
  Native & { refetchInterval: number }
>({
  queryKey: ['contracts', source],
  queryFn: (): Raw => ({ id: 1 }),
  select: (raw) => String(raw.id),
  refetchInterval: createStore(100),
})
const initial = intervalBinding.create(intervalBinding.$options.getState())
// @ts-expect-error constructor output does not promise a required reactive interval
const requiredInterval: number = initial.refetchInterval

// @ts-expect-error success requires data and null error in the native ADT
const invalidSuccess: QueryObserverSnapshot<string, Error> = {
  status: 'success',
  data: undefined,
  error: new Error(),
  isFetching: false,
  fetchStatus: 'idle',
  isPlaceholderData: false,
  dataUpdatedAt: 0,
  errorUpdatedAt: 0,
}
// @ts-expect-error pending cannot be placeholder data
const invalidPlaceholder: QueryObserverSnapshot<string, Error> = {
  status: 'pending',
  data: undefined,
  error: null,
  isFetching: false,
  fetchStatus: 'idle',
  isPlaceholderData: true,
  dataUpdatedAt: 0,
  errorUpdatedAt: 0,
}
type Observer = QueryObserver<Raw, Error, string, Raw, Key>
// @ts-expect-error required extra bindings require a producer
const missingExtras: CreateBaseQueryConfig<
  string,
  Error,
  ReturnType<Observer['getCurrentResult']>,
  Observer,
  { extra: Store<number> },
  Native
> = { createObserver: () => observer }

void [
  selectedCache,
  restored,
  restoredPages,
  mutationView,
  requiredInterval,
  invalidSuccess,
  invalidPlaceholder,
  missingExtras,
]
