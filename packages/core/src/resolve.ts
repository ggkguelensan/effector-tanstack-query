import { combine, createStore, is } from 'effector'
import type { Store } from 'effector'
import { skipToken } from '@tanstack/query-core'
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

export function resolveQueryOptions(
  options: OptionsInput,
): Store<ResolvedOptions> {
  const { enabled, refetchInterval, name: _name, ...definition } = options
  const $raw: Store<QueryObserverOptions<any, any, any, any, any>> =
    'source' in definition
      ? (is.store(definition.source)
          ? definition.source
          : combine(definition.source)
        ).map(definition.query)
      : resolveKey(definition.queryKey).map((queryKey) => ({
          ...definition,
          queryKey,
        }))
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
        enabled: effectiveEnabled && options.queryFn !== skipToken,
        ...(interval !== undefined ? { refetchInterval: interval } : {}),
        notifyOnChangeProps: 'all',
      } as ResolvedOptions
    },
  )
}
