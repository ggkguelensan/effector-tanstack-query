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

export type ResolvedOptions<TOptions extends NativeOptions = NativeOptions> =
  Omit<
    TOptions,
    'enabled' | 'notifyOnChangeProps' | 'queryHash' | '_defaulted'
  > & {
    enabled: boolean
    queryKey: TOptions['queryKey']
    notifyOnChangeProps?: NativeOptions['notifyOnChangeProps']
    queryHash?: string
    _defaulted?: boolean
  }

type OptionsInput<TOptions extends NativeOptions = NativeOptions> = {
  enabled?: StoreOrValue<boolean>
  refetchInterval?:
    | TOptions['refetchInterval']
    | Store<TOptions['refetchInterval']>
  name?: string
} & (
  | (Omit<TOptions, 'queryKey' | 'enabled' | 'refetchInterval'> & {
      queryKey: EffectorQueryKey
    })
  | {
      source: OptionsSource
      query: (params: any) => TOptions
    }
)

function resolveFactoryOptions<TOptions extends NativeOptions>(options: {
  source: OptionsSource
  query: (params: any) => TOptions
  enabled?: StoreOrValue<boolean>
  refetchInterval?:
    | TOptions['refetchInterval']
    | Store<TOptions['refetchInterval']>
  name?: string
}): Store<ResolvedOptions<TOptions>> {
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
      } as ResolvedOptions<TOptions>
    },
  )
}

function getInlineUpdateBase(previous: NativeOptions, mount: boolean) {
  if (mount) return previous

  const { _defaulted, queryHash, ...rest } = previous
  return rest
}

/** Execution policies differ intentionally: inline retains its pre-factory contract. */
export function resolveQueryDefinition<TOptions extends NativeOptions>(
  options: OptionsInput<TOptions>,
): QueryDefinition<ResolvedOptions<TOptions>> {
  if (!('queryKey' in options)) {
    const $options = resolveFactoryOptions(options)
    return {
      $options,
      $resolvedKey: $options.map((o) => o.queryKey),
      $enabled: $options.map((o) => o.enabled),
      create: (current: ResolvedOptions<TOptions>) => current,
      update: (
        _previous: NativeOptions,
        current: ResolvedOptions<TOptions>,
        _mount: boolean,
      ) => current,
      prefetch: (current: ResolvedOptions<TOptions>) => current,
    }
  }

  // Preserve inline's original constructor, setOptions and prefetch behavior,
  // including resolved defaults, custom hashes and notification filters.
  const { queryKey, enabled, name: _name, ...restOptions } = options
  const interval = restOptions.refetchInterval
  const $interval = is.store<unknown, unknown>(interval)
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
      }) as ResolvedOptions<TOptions>,
  )
  return {
    $options,
    $resolvedKey,
    $enabled,
    create: ({ queryKey, enabled }: ResolvedOptions<TOptions>) =>
      ({ ...restOptions, queryKey, enabled }) as ResolvedOptions<TOptions>,
    update: (
      previous: NativeOptions,
      current: ResolvedOptions<TOptions>,
      mount: boolean,
    ) => {
      const base = getInlineUpdateBase(previous, mount)
      return {
        ...base,
        queryKey: current.queryKey,
        enabled: current.enabled,
        ...($interval ? { refetchInterval: current.refetchInterval } : {}),
      } as ResolvedOptions<TOptions>
    },
    prefetch: ({ queryKey }: ResolvedOptions<TOptions>) =>
      ({ ...restOptions, queryKey }) as Omit<
        ResolvedOptions<TOptions>,
        'enabled'
      >,
  }
}
export interface QueryDefinition<
  TOptions extends ResolvedOptions = ResolvedOptions,
> {
  $options: Store<TOptions>
  $resolvedKey: Store<QueryKey>
  $enabled: Store<boolean>
  create: (current: TOptions) => TOptions
  update: (
    previous: NativeOptions,
    current: TOptions,
    mount: boolean,
  ) => TOptions
  prefetch: (current: TOptions) => Omit<TOptions, 'enabled'>
}
