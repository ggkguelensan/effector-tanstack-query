import { createStore } from 'effector'
import { QueryClient, QueryObserver } from '@tanstack/query-core'
import type {
  QueryObserverOptions,
  QueryObserverResult,
} from '@tanstack/query-core'
import { resolveQueryOptions } from '../resolve'
import type { ResolvedQueryObserverOptions } from '../resolve'
import type { InfiniteOptions } from '../optionsCompat'
import { createBaseQuery } from '../createBaseQuery'
import { queryOptions, infiniteQueryOptions } from '../index'

type Raw = { id: number }
class Failure extends Error {
  readonly code = 'failure'
}
type Key = readonly ['typed', number]
type Native = QueryObserverOptions<Raw, Failure, string, Raw, Key>
type Options = ResolvedQueryObserverOptions<Native>
type Observer = QueryObserver<Raw, Failure, string, Raw, Key>
type IsAny<T> = 0 extends 1 & T ? true : false
type Assert<T extends true> = T

export function checkResolvedQueryObserverOptions() {
  const source = createStore(1)
  const binding = resolveQueryOptions<Native, typeof source>({
    source,
    query: (id) =>
      queryOptions({
        queryKey: ['typed', id] as const,
        queryFn: async () => ({ id }),
        select: (data) => String(data.id),
      }),
  })
  const options = binding.$options.getState()
  const rawIsNotAny: Assert<
    IsAny<Parameters<NonNullable<typeof options.select>>[0]> extends false
      ? true
      : false
  > = true
  const selected: string = options.select!({ id: 1 })
  const key: Key = options.queryKey
  // @ts-expect-error select must accept the raw object, not selected data
  options.select!('selected')
  const wrong = queryOptions({
    queryKey: ['typed', 1] as const,
    queryFn: async () => ({ other: true }),
    select: () => '',
  })
  // @ts-expect-error a mismatched raw query function cannot satisfy the typed binding
  resolveQueryOptions<Native, typeof source>({ source, query: () => wrong })
  const base = createBaseQuery<
    string,
    Failure,
    QueryObserverResult<string, Failure>,
    Observer,
    {},
    Options,
    Native
  >(
    null,
    { binding, name: 'typed' },
    {
      createObserver: (client, current) =>
        new QueryObserver<Raw, Failure, string, Raw, Key>(client, current),
    },
  )
  // @ts-expect-error raw select argument must remain typed after the base store
  base.$options.getState().select!({ other: true })
  const createWrongObserver = () =>
    new QueryObserver<
      { other: boolean },
      Failure,
      string,
      { other: boolean },
      Key
    >(new QueryClient(), {
      queryKey: ['typed', 1],
      queryFn: async () => ({ other: true }),
      select: (data) => String(data.other),
    })
  createBaseQuery<
    string,
    Failure,
    QueryObserverResult<string, Failure>,
    Observer,
    {},
    Options,
    Native
  >(
    null,
    { binding },
    {
      // @ts-expect-error observer data types must match the binding and creator contract
      createObserver: createWrongObserver,
    },
  )
  type Page = { items: number[] }
  type Infinite = InfiniteOptions<Page, Failure, string, Key, number>
  const infinite = resolveQueryOptions<Infinite, typeof source>({
    source,
    query: (id) =>
      infiniteQueryOptions({
        queryKey: ['typed', id] as const,
        initialPageParam: 0,
        queryFn: async ({ pageParam }: { pageParam: number }) => ({
          items: [pageParam],
        }),
        getNextPageParam: (_last, _pages, lastParam) => lastParam + 1,
        select: (data) => data.pages.flatMap((p) => p.items).join(','),
      }),
  })
  const pageParam: number = infinite.$options.getState().initialPageParam
  // @ts-expect-error page parameter must remain a number
  const wrongPage: string = infinite.$options.getState().initialPageParam
  return { rawIsNotAny, selected, key, base, pageParam, wrongPage }
}

export function checkFactoryOverrides() {
  const binding = resolveQueryOptions({
    source: createStore(1),
    enabled: true,
    query: (id) => ({
      queryKey: ['flags', id] as const,
      queryFn: async () => ({ id }),
      enabled: false as const,
      notifyOnChangeProps: ['data'] as ['data'],
    }),
  })
  // @ts-expect-error top-level overrides mean resolved enabled cannot retain the literal false
  const alwaysFalse: false = binding.$options.getState().enabled
  // @ts-expect-error factory policy forces all, so the raw notify tuple is not the resolved type
  const onlyData: ['data'] = binding.$options.getState().notifyOnChangeProps!
  return { alwaysFalse, onlyData }
}
