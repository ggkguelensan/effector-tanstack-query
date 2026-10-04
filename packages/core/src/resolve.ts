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
  FactoryArguments,
  StoreOrValue,
  SourceValue,
} from './types'
import type { NoInfer } from './optionsCompat'

export function resolveFactoryArguments<TOptions>(
  args: FactoryArguments<TOptions>,
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
      stores.push(item)
    }
  })

  if (stores.length === 0) {
    return createStore(key)
  }

  return combine(stores).map<QueryKey>((values) =>
    key.map((item, i) => {
      const storeIdx = storePositions.indexOf(i)
      return storeIdx >= 0 ? values[storeIdx] : item
    }),
  )
}

/** Complete options at the adapter seam; runtime instances are never serialized. */
type AnyQueryObserverOptions = QueryObserverOptions<any, any, any, any, any>

export type ResolvedQueryObserverOptions<
  TOptions extends AnyQueryObserverOptions = AnyQueryObserverOptions,
> = Omit<
  TOptions,
  | 'enabled'
  | 'refetchInterval'
  | 'notifyOnChangeProps'
  | 'queryHash'
  | '_defaulted'
> & {
  enabled: boolean
  refetchInterval?: TOptions['refetchInterval'] | number | false
  queryKey: NonNullable<TOptions['queryKey']>
  notifyOnChangeProps?: AnyQueryObserverOptions['notifyOnChangeProps']
  queryHash?: string
  _defaulted?: boolean
}

type QueryOptionsInput<
  TOptions extends AnyQueryObserverOptions,
  TSource extends OptionsSource,
> = {
  enabled?: StoreOrValue<boolean>
  refetchInterval?:
    | TOptions['refetchInterval']
    | Store<number | false | undefined>
  name?: string
} & (
  | (Omit<TOptions, 'queryKey' | 'enabled' | 'refetchInterval'> & {
      queryKey: EffectorQueryKey
    })
  | {
      queryKey?: never
      source: TSource
      query: (
        params: SourceValue<NoInfer<TSource>>,
      ) => TOptions & { queryKey: NonNullable<TOptions['queryKey']> }
    }
)

function resolveFactoryOptions<
  TOptions extends AnyQueryObserverOptions,
  TSource extends OptionsSource,
>(options: {
  source: TSource
  query: (
    params: SourceValue<NoInfer<TSource>>,
  ) => TOptions & { queryKey: NonNullable<TOptions['queryKey']> }
  enabled?: StoreOrValue<boolean>
  refetchInterval?:
    | TOptions['refetchInterval']
    | Store<number | false | undefined>
  name?: string
}): Store<ResolvedQueryObserverOptions<TOptions>> {
  const { enabled, refetchInterval, name: _name, ...binding } = options
  // Effector resolves one store or every field of a source shape. Its overloads
  // cannot express this conditional result while TSource remains generic.
  const $source = (
    is.store(binding.source) ? binding.source : combine(binding.source)
  ) as Store<SourceValue<TSource>>
  const $raw = $source.map(binding.query)
  const $enabled = is.store(enabled)
    ? enabled
    : createStore(enabled, { skipVoid: false, serialize: 'ignore' })
  const $interval = is.store(refetchInterval)
    ? refetchInterval
    : createStore(refetchInterval, { skipVoid: false, serialize: 'ignore' })
  return combine(
    { options: $raw, enabled: $enabled, interval: $interval },
    ({
      options,
      enabled,
      interval,
    }): ResolvedQueryObserverOptions<TOptions> => {
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

function getInlineUpdateBase<TOptions extends AnyQueryObserverOptions>(
  previous: TOptions,
  mount: boolean,
) {
  if (mount) return previous

  const { _defaulted, queryHash, ...rest } = previous
  return rest
}

/** Execution policies differ intentionally: inline retains its pre-factory contract. */
export function resolveQueryOptions<
  TOptions extends AnyQueryObserverOptions,
  TSource extends OptionsSource = OptionsSource,
>(options: QueryOptionsInput<TOptions, TSource>) {
  if (options.queryKey === undefined) {
    const $options = resolveFactoryOptions(options)
    return {
      $options,
      $resolvedKey: $options.map((o) => o.queryKey),
      $enabled: $options.map((o) => o.enabled),
      create: (current: ResolvedQueryObserverOptions<TOptions>) => current,
      update: (
        _previous: TOptions,
        current: ResolvedQueryObserverOptions<TOptions>,
        _mount: boolean,
      ) => current,
      prefetch: (current: ResolvedQueryObserverOptions<TOptions>) => current,
    }
  }

  // Preserve inline's original constructor, setOptions and prefetch behavior,
  // including resolved defaults, custom hashes and notification filters.
  const { queryKey, enabled, name: _name, ...capturedOptions } = options
  // Object rest copied this field unchanged; mapped generic types lose its
  // precise declaration. Read the captured value without invoking a getter again.
  const interval =
    capturedOptions.refetchInterval as typeof options.refetchInterval
  const $interval = is.store(interval) ? interval : undefined
  if ($interval) delete capturedOptions.refetchInterval
  // The only non-native value in this field was the Store removed above.
  // Narrow that field without copying the captured object a second time.
  const restOptions = capturedOptions as Omit<
    typeof capturedOptions,
    'refetchInterval'
  > & {
    refetchInterval?: TOptions['refetchInterval']
  }
  // Public inline overloads link the native key to the unwrapped tuple.
  const $resolvedKey = resolveKey(queryKey) as Store<
    NonNullable<TOptions['queryKey']>
  >
  const $enabled = is.store(enabled) ? enabled : createStore(enabled ?? true)
  const $options = combine({
    queryKey: $resolvedKey,
    enabled: $enabled,
    refetchInterval:
      $interval ?? createStore<number | false | undefined>(false),
  }).map(({ queryKey, enabled, refetchInterval }) => ({
    ...restOptions,
    queryKey,
    enabled,
    ...($interval ? { refetchInterval } : {}),
  }))
  return {
    $options,
    $resolvedKey,
    $enabled,
    create: ({
      queryKey,
      enabled,
    }: ResolvedQueryObserverOptions<TOptions>) => ({
      ...restOptions,
      queryKey,
      enabled,
    }),
    update: (
      previous: TOptions,
      current: ResolvedQueryObserverOptions<TOptions>,
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
    prefetch: ({ queryKey }: ResolvedQueryObserverOptions<TOptions>) => ({
      ...restOptions,
      queryKey,
    }),
  }
}
/** Reactive options and the operation-specific policies consumed by query owners. */
export interface QueryOptionsBinding<
  TOptions extends ResolvedQueryObserverOptions = ResolvedQueryObserverOptions,
  TObserverOptions extends AnyQueryObserverOptions = AnyQueryObserverOptions,
  TFetchOptions = unknown,
> {
  $options: Store<TOptions>
  $resolvedKey: Store<QueryKey>
  $enabled: Store<boolean>
  create: (current: TOptions) => TObserverOptions
  update: (
    previous: TObserverOptions,
    current: TOptions,
    mount: boolean,
  ) => TObserverOptions
  prefetch: (current: TOptions) => TFetchOptions
}
