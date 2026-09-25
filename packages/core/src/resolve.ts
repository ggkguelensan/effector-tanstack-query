import { combine, createStore, is } from 'effector'
import type { Store } from 'effector'
import type { QueryKey, QueryObserverOptions } from '@tanstack/query-core'
import type { EffectorQueryKey, OptionsSource, StoreOrValue } from './types'

export function resolveKey(key: EffectorQueryKey): Store<QueryKey> {
  const storePositions: Array<number> = []
  const stores: Array<Store<unknown>> = []

  key.forEach((item, i) => {
    if (is.store(item)) {
      storePositions.push(i)
      stores.push(item as Store<unknown>)
    }
  })

  if (stores.length === 0) {
    return createStore(key as QueryKey)
  }

  return combine(stores).map((values) =>
    key.map((item, i) => {
      const storeIdx = storePositions.indexOf(i)
      return storeIdx >= 0 ? values[storeIdx] : item
    }),
  ) as unknown as Store<QueryKey>
}

/** Complete options at the adapter seam; runtime instances are never serialized. */
export type ResolvedOptions = QueryObserverOptions<any, any, any, any, any> & {
  enabled: boolean
  queryKey: QueryKey
}

type OptionsInput = {
  enabled?: StoreOrValue<boolean>
  refetchInterval?: unknown
  name?: string
} & (
  | { queryKey: EffectorQueryKey }
  | {
      source: OptionsSource
      query: (params: any) => QueryObserverOptions<any, any, any, any, any>
    }
)

function resolveFactoryOptions(
  options: Extract<OptionsInput, { source: OptionsSource }>,
): Store<ResolvedOptions> {
  const { enabled, refetchInterval, name: _name, ...definition } = options
  const $raw = (
    is.store(definition.source) ? definition.source : combine(definition.source)
  ).map(definition.query)
  const $enabled = is.store(enabled)
    ? enabled
    : createStore(enabled, { skipVoid: false, serialize: 'ignore' })
  const $interval = is.store(refetchInterval)
    ? refetchInterval
    : createStore(refetchInterval, { skipVoid: false, serialize: 'ignore' })
  return combine(
    { options: $raw, enabled: $enabled, interval: $interval },
    ({ options, enabled, interval }) => {
      const effectiveEnabled = enabled ?? options.enabled ?? true
      if (typeof effectiveEnabled !== 'boolean') {
        throw new TypeError(
          '[@effector-tanstack-query/core] enabled must resolve to a boolean. ' +
            'Use combine to derive a boolean store, or override factory enabled at the top level.',
        )
      }
      return {
        ...options,
        enabled: effectiveEnabled && typeof options.queryFn !== 'symbol',
        ...(interval !== undefined ? { refetchInterval: interval } : {}),
        notifyOnChangeProps: 'all',
      } as ResolvedOptions
    },
  )
}

/** Execution policies differ intentionally: inline retains its pre-factory contract. */
export function resolveQueryDefinition(options: OptionsInput): QueryDefinition {
  if (!('queryKey' in options)) {
    const $options = resolveFactoryOptions(options)
    return {
      $options,
      $resolvedKey: $options.map((o) => o.queryKey),
      $enabled: $options.map((o) => o.enabled),
      create: (current: ResolvedOptions) => current,
      update: (
        _previous: ResolvedOptions,
        current: ResolvedOptions,
        _mount: boolean,
      ) => current,
      prefetch: (current: ResolvedOptions) => current,
    }
  }

  // Preserve inline's original constructor, setOptions and prefetch behavior,
  // including resolved defaults, custom hashes and notification filters.
  const { queryKey, enabled, name: _name, ...restOptions } = options
  const interval = restOptions.refetchInterval
  const $interval = is.store(interval)
    ? (interval as Store<number | false | undefined>)
    : undefined
  if ($interval) delete restOptions.refetchInterval
  const $resolvedKey = resolveKey(queryKey)
  const $enabled = is.store(enabled) ? enabled : createStore(enabled ?? true)
  const $options = combine({
    queryKey: $resolvedKey,
    enabled: $enabled,
    refetchInterval:
      $interval ?? createStore<number | false | undefined>(false),
  }).map(
    ({ queryKey, enabled, refetchInterval }) =>
      ({
        ...restOptions,
        queryKey,
        enabled,
        ...($interval ? { refetchInterval } : {}),
      }) as ResolvedOptions,
  )
  return {
    $options,
    $resolvedKey,
    $enabled,
    create: ({ queryKey, enabled }: ResolvedOptions) =>
      ({ ...restOptions, queryKey, enabled }) as ResolvedOptions,
    update: (
      previous: ResolvedOptions,
      current: ResolvedOptions,
      mount: boolean,
    ) => {
      let base = previous
      if (!mount) {
        const { _defaulted, queryHash, ...rest } = previous
        base = rest as ResolvedOptions
      }
      return {
        ...base,
        queryKey: current.queryKey,
        enabled: current.enabled,
        ...($interval ? { refetchInterval: current.refetchInterval } : {}),
      }
    },
    prefetch: ({ queryKey }: ResolvedOptions) =>
      ({ ...restOptions, queryKey }) as QueryObserverOptions<
        any,
        any,
        any,
        any,
        any
      > & { queryKey: QueryKey },
  }
}
export interface QueryDefinition {
  $options: Store<ResolvedOptions>
  $resolvedKey: Store<QueryKey>
  $enabled: Store<boolean>
  create: (current: ResolvedOptions) => ResolvedOptions
  update: (
    previous: ResolvedOptions,
    current: ResolvedOptions,
    mount: boolean,
  ) => ResolvedOptions
  prefetch: (
    current: ResolvedOptions,
  ) => QueryObserverOptions<any, any, any, any, any> & { queryKey: QueryKey }
}
