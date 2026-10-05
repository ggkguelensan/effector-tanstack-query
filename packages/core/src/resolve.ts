import { combine, createStore, is } from 'effector'
import type { Store } from 'effector'
import type {
  QueryClient,
  QueryKey,
  QueryObserverOptions,
} from '@tanstack/query-core'
import type {
  EffectorQueryKey,
  OptionsSource,
  QueryArguments,
  StoreOrValue,
} from './types'

export function resolveQueryArguments<TOptions>(
  args: QueryArguments<TOptions>,
): [QueryClient | null, TOptions] {
  if (args.length === 2) return args
  return [null, args[0]]
}

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

  return combine(stores).map<QueryKey>((values) =>
    key.map((item, i) => {
      const storeIdx = storePositions.indexOf(i)
      return storeIdx >= 0 ? values[storeIdx] : item
    }),
  )
}

/** Complete options at the adapter seam; runtime instances are never serialized. */
type NativeOptions = QueryObserverOptions<any, any, any, any, any>

export type ResolvedOptions = Omit<NativeOptions, 'enabled' | 'queryKey'> & {
  enabled: boolean
  queryKey: QueryKey
}

type OptionsInput = {
  enabled?: StoreOrValue<boolean>
  refetchInterval?:
    | NativeOptions['refetchInterval']
    | Store<number | false | undefined>
  name?: string
} & (
  | (Omit<NativeOptions, 'queryKey' | 'enabled' | 'refetchInterval'> & {
      queryKey: EffectorQueryKey
    })
  | {
      queryKey?: never
      source: OptionsSource
      query: (
        params: any,
      ) => Omit<NativeOptions, 'queryKey'> & { queryKey: QueryKey }
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
    ({ options, enabled, interval }): ResolvedOptions => {
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
      }
    },
  )
}

function getInlineUpdateBase(previous: NativeOptions, mount: boolean) {
  if (mount) return previous

  const { _defaulted, queryHash, ...rest } = previous
  return rest
}

/** Execution policies differ intentionally: inline retains its pre-factory contract. */
export function resolveQueryDefinition(options: OptionsInput): QueryDefinition {
  if (options.queryKey === undefined) {
    const $options = resolveFactoryOptions(options)
    return {
      $options,
      $resolvedKey: $options.map((o) => o.queryKey),
      $enabled: $options.map((o) => o.enabled),
      create: (current: ResolvedOptions) => current,
      update: (
        _previous: NativeOptions,
        current: ResolvedOptions,
        _mount: boolean,
      ) => current,
      prefetch: (current: ResolvedOptions) => current,
    }
  }

  // Preserve inline's original constructor, setOptions and prefetch behavior,
  // including resolved defaults, custom hashes and notification filters.
  const { queryKey, enabled, name: _name, ...capturedOptions } = options
  const interval = capturedOptions.refetchInterval
  const $interval = is.store(interval) ? interval : undefined
  if ($interval) delete capturedOptions.refetchInterval
  // The adapter Store was removed above. Narrow only this field, retaining
  // the original captured object without another options copy.
  const restOptions = capturedOptions as Omit<
    typeof capturedOptions,
    'refetchInterval'
  > & { refetchInterval?: NativeOptions['refetchInterval'] }
  const $resolvedKey = resolveKey(queryKey)
  const $enabled = is.store(enabled) ? enabled : createStore(enabled ?? true)
  const $options = combine({
    queryKey: $resolvedKey,
    enabled: $enabled,
    refetchInterval:
      $interval ?? createStore<number | false | undefined>(false),
  }).map(
    ({ queryKey, enabled, refetchInterval }): ResolvedOptions => ({
      ...restOptions,
      queryKey,
      enabled,
      ...($interval ? { refetchInterval } : {}),
    }),
  )
  return {
    $options,
    $resolvedKey,
    $enabled,
    create: ({ queryKey, enabled }: ResolvedOptions) => ({
      ...restOptions,
      queryKey,
      enabled,
    }),
    update: (
      previous: NativeOptions,
      current: ResolvedOptions,
      mount: boolean,
    ) => {
      const base = getInlineUpdateBase(previous, mount)
      return {
        ...base,
        queryKey: current.queryKey,
        enabled: current.enabled,
        ...($interval ? { refetchInterval: current.refetchInterval } : {}),
      }
    },
    prefetch: ({ queryKey }: ResolvedOptions) => ({ ...restOptions, queryKey }),
  }
}
export interface QueryDefinition {
  $options: Store<ResolvedOptions>
  $resolvedKey: Store<QueryKey>
  $enabled: Store<boolean>
  create: (current: ResolvedOptions) => ResolvedOptions
  update: (
    previous: NativeOptions,
    current: ResolvedOptions,
    mount: boolean,
  ) => ResolvedOptions
  prefetch: (current: ResolvedOptions) => Omit<ResolvedOptions, 'enabled'>
}
