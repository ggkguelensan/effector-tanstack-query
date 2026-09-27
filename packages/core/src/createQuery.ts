import type { NoInfer } from './optionsCompat'
import { attach, createEvent, sample } from 'effector'
import { QueryObserver } from '@tanstack/query-core'
import type { QueryClient, QueryKey, DefaultError } from '@tanstack/query-core'
import { createBaseQuery, warnMissingName } from './createBaseQuery'
import { resolveQueryDefinition } from './resolve'
import { attachQueryInternals } from './queryInternals'
import type { SuspenseReader } from './queryInternals'
import type {
  CreateQueryOptions,
  CreateQueryFactoryOptions,
  OptionsSource,
  InheritSelection,
  OverrideSelection,
  EffectorQueryKey,
  QueryResult,
} from './types'

export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
  TFactoryData = TQueryFnData,
>(
  options: CreateQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TFactoryData
  > &
    OverrideSelection<NoInfer<TQueryFnData>, TData>,
): QueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
  TFactoryData = TQueryFnData,
>(
  queryClient: QueryClient,
  options: CreateQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TFactoryData
  > &
    OverrideSelection<NoInfer<TQueryFnData>, TData>,
): QueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
>(
  options: CreateQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TData,
    TQueryKey
  > &
    InheritSelection,
): QueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
>(
  queryClient: QueryClient,
  options: CreateQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TData,
    TQueryKey
  > &
    InheritSelection,
): QueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
  TFactoryData = TQueryFnData,
>(
  options: CreateQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TFactoryData
  >,
): QueryResult<TData | TFactoryData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
  TFactoryData = TQueryFnData,
>(
  queryClient: QueryClient,
  options: CreateQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TFactoryData
  >,
): QueryResult<TData | TFactoryData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  options: CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): QueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  queryClient: QueryClient,
  options: CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): QueryResult<TData, TError>
export function createQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  arg1:
    | QueryClient
    | CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>
    | CreateQueryFactoryOptions<any, TQueryFnData, TError, TData, any>,
  arg2?:
    | CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>
    | CreateQueryFactoryOptions<any, TQueryFnData, TError, TData, any>,
): QueryResult<TData, TError> {
  const explicitClient = arg2 === undefined ? null : (arg1 as QueryClient)
  const options = arg2 ?? (arg1 as Exclude<typeof arg1, QueryClient>)
  const { name } = options
  if (!name) warnMissingName('createQuery')
  const definition = resolveQueryDefinition(options)

  const base = createBaseQuery<
    TData,
    TError,
    ReturnType<QueryObserver<TQueryFnData, TError, TData>['getCurrentResult']>,
    QueryObserver<TQueryFnData, TError, TData>
  >(
    explicitClient,
    { definition, name },
    {
      createObserver: (qc, options) =>
        new QueryObserver<TQueryFnData, TError, TData>(qc, options),
    },
  )

  // Prefetch event: drives `queryClient.fetchQuery` directly (no Observer)
  // and **awaits** the result, so `allSettled(query.prefetch, { scope })` on
  // the server returns only after the cache has the data. Unlike `mounted`,
  // which kicks off a background subscription and resolves immediately, this
  // is the right primitive for SSR / route loaders. The current resolved key
  // + enabled is read from the scope via attach — reactive keys work.
  const prefetch = createEvent<void>()
  const prefetchFx = attach({
    source: {
      qc: base.$queryClient,
      options: base.$options,
    },
    effect: ({ qc, options }) => {
      if (!qc || !options.enabled) return
      return qc.fetchQuery(definition.prefetch(options) as any)
    },
  })
  sample({ clock: prefetch, target: prefetchFx })

  // Lazy `observer` field for backward compatibility — returns the
  // default-scope observer (non-fork). Tests and advanced consumers that read
  // `query.observer` after `query.mounted()` see the live observer. For
  // fork-aware consumers, use `query.$observer` via `useUnit`.
  const result: QueryResult<TData, TError> = {
    $data: base.$data,
    $error: base.$error,
    $status: base.$status,
    $isPending: base.$isPending,
    $isFetching: base.$isFetching,
    $isSuccess: base.$isSuccess,
    $isError: base.$isError,
    $isPlaceholderData: base.$isPlaceholderData,
    $fetchStatus: base.$fetchStatus,
    $observer: base.$observer as unknown as QueryResult<
      TData,
      TError
    >['$observer'],
    $queryClient: base.$queryClient,
    refresh: base.refresh,
    prefetch,
    mounted: base.mounted,
    unmounted: base.unmounted,
    finished: base.finished,
  }

  function toReader(
    observer: QueryObserver<TQueryFnData, TError, TData>,
  ): SuspenseReader {
    return {
      read: () => ({
        kind: 'query',
        // TanStack defaults options in its constructor and setOptions, but
        // the public options property retains its non-defaulted type.
        ...observer.getOptimisticResult(
          observer.options as Parameters<
            typeof observer.getOptimisticResult
          >[0],
        ),
      }),
      fetch: () => observer.fetchOptimistic(observer.options),
      subscribe: (listener) => observer.subscribe(listener),
    }
  }

  attachQueryInternals(result, {
    $options: base.$options,
    $reader: base.$observer.map((observer) =>
      observer ? toReader(observer) : null,
    ),
    createReader: (qc, options) =>
      toReader(
        new QueryObserver<TQueryFnData, TError, TData>(
          qc,
          definition.create(options),
        ),
      ),
  })

  return result
}
