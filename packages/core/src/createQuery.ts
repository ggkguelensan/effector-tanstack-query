import { attach, createEvent, sample } from 'effector'
import { QueryObserver } from '@tanstack/query-core'
import type {
  QueryClient,
  FetchQueryOptions,
  QueryKey,
  DefaultError,
  QueryObserverOptions,
} from '@tanstack/query-core'
import { createBaseQuery, warnMissingName } from './createBaseQuery'
import { resolveFactoryArguments, resolveQueryOptions } from './resolve'
import type {
  ResolvedQueryObserverOptions,
  QueryOptionsBinding,
} from './resolve'
import type { NoInfer } from './optionsCompat'
import type {
  CreateQueryOptions,
  CreateQueryFactoryOptions,
  OptionsSource,
  FactoryArguments,
  EffectorQueryKey,
  QueryResult,
  ResolvedQueryKey,
  QueryObserverFactory,
} from './types'

// Selected data must be inferred from queryFn/select, not from a result view.
export function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
>(
  ...args: FactoryArguments<
    CreateQueryFactoryOptions<TSource, TQueryFnData, TError, TData, TQueryKey>
  >
): QueryResult<NoInfer<TData>, TError, TQueryFnData, TQueryKey>
export function createQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  options: CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): QueryResult<
  NoInfer<TData>,
  TError,
  TQueryFnData,
  ResolvedQueryKey<TQueryKey>
>
export function createQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  queryClient: QueryClient,
  options: CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): QueryResult<
  NoInfer<TData>,
  TError,
  TQueryFnData,
  ResolvedQueryKey<TQueryKey>
>
export function createQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  ...args: FactoryArguments<
    | CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>
    | CreateQueryFactoryOptions<any, TQueryFnData, TError, TData, any>
  >
): QueryResult<
  NoInfer<TData>,
  TError,
  TQueryFnData,
  ResolvedQueryKey<TQueryKey>
> {
  const [explicitClient, options] = resolveFactoryArguments(args)
  const { name } = options
  if (!name) warnMissingName('createQuery')
  type Key = ResolvedQueryKey<TQueryKey>
  type NativeOptions = QueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryFnData,
    Key
  >
  type Options = ResolvedQueryObserverOptions<NativeOptions>
  type Observer = QueryObserver<TQueryFnData, TError, TData, TQueryFnData, Key>
  const binding = resolveQueryOptions<NativeOptions>(
    options,
  ) satisfies QueryOptionsBinding<
    Options,
    NativeOptions,
    FetchQueryOptions<TQueryFnData, TError, TQueryFnData, Key>
  >

  const base = createBaseQuery<
    TData,
    TError,
    ReturnType<Observer['getCurrentResult']>,
    Observer,
    {},
    Options,
    NativeOptions
  >(
    explicitClient,
    { binding, name },
    {
      createObserver: (qc, options) =>
        new QueryObserver<TQueryFnData, TError, TData, TQueryFnData, Key>(
          qc,
          options,
        ),
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
      return qc.fetchQuery(binding.prefetch(options))
    },
  })
  sample({ clock: prefetch, target: prefetchFx })

  // Lazy `observer` field for backward compatibility — returns the
  // default-scope observer (non-fork). Tests and advanced consumers that read
  // `query.observer` after `query.mounted()` see the live observer. For
  // fork-aware consumers, use `query.$observer` via `useUnit`.
  const result: QueryResult<
    TData,
    TError,
    TQueryFnData,
    ResolvedQueryKey<TQueryKey>
  > = {
    $data: base.$data,
    $error: base.$error,
    $status: base.$status,
    $isPending: base.$isPending,
    $isFetching: base.$isFetching,
    $isSuccess: base.$isSuccess,
    $isError: base.$isError,
    $isPlaceholderData: base.$isPlaceholderData,
    $fetchStatus: base.$fetchStatus,
    $observer: base.$observer,
    $queryClient: base.$queryClient,
    refresh: base.refresh,
    prefetch,
    mounted: base.mounted,
    unmounted: base.unmounted,
    finished: base.finished,
  }

  // Internal: used by useSuspenseQuery to construct a transient observer
  // when the suspense hook renders before mountFx has populated the scope's
  // $observer (mountFx runs from useEffect, which is skipped while
  // suspended). Not part of the public API; not in TS types.
  Object.defineProperty(result, '__createObserver', {
    enumerable: false,
    value: ((qc: QueryClient, options: Options) =>
      new QueryObserver<TQueryFnData, TError, TData, TQueryFnData, Key>(
        qc,
        binding.create(options),
      )) satisfies QueryObserverFactory<
      NativeOptions,
      Observer
    >['__createObserver'],
  })
  Object.defineProperty(result, '__options', {
    enumerable: false,
    value: base.$options satisfies QueryObserverFactory<
      NativeOptions,
      Observer
    >['__options'],
  })

  return result
}
