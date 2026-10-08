import {
  attach,
  createEvent,
  createStore,
  sample,
  scopeBind,
  type Store,
} from 'effector'
import { QueriesObserver, hashKey } from '@tanstack/query-core'
import type { QueryClient, QueryObserverResult } from '@tanstack/query-core'
import { $queryClient as $globalQueryClient } from './queryClient'
import { sidConfig, warnMissingName } from './createBaseQuery'
import type {
  CreateQueriesOptions,
  QueriesResult,
  QueryItemState,
} from './types'

const EMPTY_ITEMS: ReadonlyArray<QueryItemState<unknown, unknown, unknown>> = []

/**
 * Experimental QueriesObserver-backed family. See research/observer-runtime
 * for duplicate-key behavior changes, type failures and dependency measurements.
 */
export function createQueries<
  TItem,
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
>(
  options: CreateQueriesOptions<TItem, TQueryFnData, TError, TData, TQueryKey>,
): QueriesResult<TItem, TData, TError>
export function createQueries<
  TItem,
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
>(
  queryClient: QueryClient,
  options: CreateQueriesOptions<TItem, TQueryFnData, TError, TData, TQueryKey>,
): QueriesResult<TItem, TData, TError>
export function createQueries<
  TItem,
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
>(
  arg1:
    | QueryClient
    | CreateQueriesOptions<TItem, TQueryFnData, TError, TData, TQueryKey>,
  arg2?: CreateQueriesOptions<TItem, TQueryFnData, TError, TData, TQueryKey>,
): QueriesResult<TItem, TData, TError> {
  const [explicitClient, options] = parseArgs<
    TItem,
    TQueryFnData,
    TError,
    TData,
    TQueryKey
  >(arg1, arg2)

  const { name, source, query, ...sharedOptions } = options

  if (!name) warnMissingName('createQueries')

  const $queryClient: Store<QueryClient | null> = explicitClient
    ? createStore(explicitClient as QueryClient | null, {
        serialize: 'ignore',
      })
    : $globalQueryClient

  const $observer = createStore<QueriesObserver | null>(null, {
    serialize: 'ignore',
  })
  const observerChanged = createEvent<QueriesObserver>()
  $observer.on(observerChanged, (_, observer) => observer)
  const subscriptions = new WeakMap<QueriesObserver, () => void>()
  const $refCount = createStore(0, { serialize: 'ignore' })
  const refCountChanged = createEvent<number>()
  $refCount.on(refCountChanged, (_, count) => count)
  const itemsUpdated = createEvent<ReadonlyArray<QueryItemState<TItem, TData, TError>>>()
  const $items = createStore<ReadonlyArray<QueryItemState<TItem, TData, TError>>>(
    EMPTY_ITEMS as ReadonlyArray<QueryItemState<TItem, TData, TError>>,
    { ...sidConfig(name, '$items') },
  ).on(itemsUpdated, (_, items) => items)
  const mounted = createEvent<void>()
  const unmounted = createEvent<void>()
  const refresh = createEvent<void>()
  const refreshOne = createEvent<TItem>()
  const prefetch = createEvent<void>()

  function buildObserverOptions(item: TItem) {
    const itemOptions = query(item)
    return { ...sharedOptions, ...itemOptions, enabled: itemOptions.enabled ?? true }
  }
  function itemsFromObserver(src: ReadonlyArray<TItem>, observer: QueriesObserver) {
    // QueriesObserver does not preserve each observer's data/error generics.
    const results = observer.getCurrentResult() as Array<QueryObserverResult<TData, TError>>
    return src.map((item, index): QueryItemState<TItem, TData, TError> => {
      const result = results[index]
      if (!result) return defaultItemState(item)
      return {
        source: item, data: result.data, error: result.error, status: result.status,
        isPending: result.isPending, isFetching: result.isFetching,
        isSuccess: result.isSuccess, isError: result.isError,
        isPlaceholderData: result.isPlaceholderData, fetchStatus: result.fetchStatus,
      }
    })
  }
  const recomputeFx = attach({
    source: { observer: $observer, currentSource: source },
    effect: ({ observer, currentSource }) => observer
      ? itemsFromObserver(currentSource, observer)
      : currentSource.map(defaultItemState),
  })
  sample({ clock: recomputeFx.doneData, target: itemsUpdated })
  const syncFx = attach({
    source: { qc: $queryClient, observer: $observer, refCount: $refCount, currentSource: source },
    effect: ({ qc, observer: previous, refCount, currentSource }) => {
      if (!qc) return { observer: previous, items: currentSource.map(defaultItemState) }
      const observer = previous ?? new QueriesObserver(qc, [])
      observer.setQueries(currentSource.map(buildObserverOptions))
      if (refCount > 0 && !subscriptions.has(observer)) {
        const recompute = scopeBind(recomputeFx, { safe: true })
        subscriptions.set(observer, observer.subscribe(() => recompute()))
      }
      return { observer, items: itemsFromObserver(currentSource, observer) }
    },
  })
  sample({ clock: syncFx.doneData, filter: ({ observer }) => observer !== null,
    fn: ({ observer }) => observer!, target: observerChanged })
  sample({ clock: syncFx.doneData, fn: ({ items }) => items, target: itemsUpdated })
  sample({ clock: source, target: syncFx })
  sample({ clock: $queryClient, target: syncFx })
  const mountFx = attach({ source: $refCount, effect: count => count + 1 })
  sample({ clock: mounted, target: mountFx })
  sample({ clock: mountFx.doneData, target: refCountChanged })
  sample({ clock: mountFx.done, target: syncFx })
  const unmountFx = attach({
    source: { observer: $observer, refCount: $refCount },
    effect: ({ observer, refCount }) => {
      const count = Math.max(0, refCount - 1)
      if (count === 0 && observer) {
        subscriptions.get(observer)?.()
        subscriptions.delete(observer)
      }
      return count
    },
  })
  sample({ clock: unmounted, target: unmountFx })
  sample({ clock: unmountFx.doneData, target: refCountChanged })
  const refreshFx = attach({ source: $observer, effect: async observer => {
    await Promise.all(observer?.getObservers().map(entry => entry.refetch().catch(() => undefined)) ?? [])
  } })
  sample({ clock: refresh, target: refreshFx })
  const refreshOneFx = attach({ source: $observer, effect: async (observer, item: TItem) => {
    const hash = hashKey(query(item).queryKey)
    const entry = observer?.getObservers().find(entry => hashKey(entry.options.queryKey) === hash)
    await entry?.refetch().catch(() => undefined)
  } })
  sample({ clock: refreshOne, target: refreshOneFx })
  const prefetchFx = attach({ source: { qc: $queryClient, currentSource: source },
    effect: async ({ qc, currentSource }) => {
      if (!qc) return
      await Promise.all(currentSource.map(item => {
        const options = query(item)
        if (options.enabled === false) return Promise.resolve()
        return qc.fetchQuery({ ...sharedOptions, ...options }).catch(() => undefined)
      }))
    },
  })
  sample({ clock: prefetch, target: prefetchFx })
  sample({ clock: prefetchFx.done, target: syncFx })

  // Derived stores — convenience views.
  const $data = $items.map((items) => items.map((it) => it.data))
  const $isPending = $items.map((items) =>
    items.length === 0 ? false : items.some((it) => it.isPending),
  )
  const $isSuccess = $items.map((items) =>
    items.length === 0 ? true : items.every((it) => it.isSuccess),
  )
  const $isFetching = $items.map((items) => items.some((it) => it.isFetching))
  const $isError = $items.map((items) => items.some((it) => it.isError))

  const result: QueriesResult<TItem, TData, TError> = {
    $items,
    $data,
    $isPending,
    $isSuccess,
    $isFetching,
    $isError,
    mounted,
    unmounted,
    refresh,
    refreshOne,
    prefetch,
    $queryClient,
    __family: true,
  }

  // Internal: callable from the suspense hook to reconstruct the
  // QueryObserver options for one source item (with sharedOptions
  // merged on top of `query(item)` and the default `enabled: true`).
  // The hook then feeds this into `qc.fetchQuery` to obtain a
  // deduped-by-queryHash inflight promise to throw at React.
  Object.defineProperty(result, '__queryFor', {
    enumerable: false,
    value: buildObserverOptions,
  })

  return result

  function defaultItemState(item: TItem): QueryItemState<TItem, TData, TError> {
    return {
      source: item,
      data: undefined,
      error: null,
      status: 'pending',
      isPending: true,
      isFetching: false,
      isSuccess: false,
      isError: false,
      isPlaceholderData: false,
      fetchStatus: 'idle',
    }
  }
}

function parseArgs<TItem, TQueryFnData, TError, TData, TQueryKey extends ReadonlyArray<unknown>>(
  arg1:
    | QueryClient
    | CreateQueriesOptions<TItem, TQueryFnData, TError, TData, TQueryKey>,
  arg2?: CreateQueriesOptions<TItem, TQueryFnData, TError, TData, TQueryKey>,
): [
  QueryClient | null,
  CreateQueriesOptions<TItem, TQueryFnData, TError, TData, TQueryKey>,
] {
  if (arg2 !== undefined) {
    return [arg1 as QueryClient, arg2]
  }
  return [
    null,
    arg1 as CreateQueriesOptions<
      TItem,
      TQueryFnData,
      TError,
      TData,
      TQueryKey
    >,
  ]
}
