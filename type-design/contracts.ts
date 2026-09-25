import type { Store, EventCallable } from 'effector'
import type {
  DefaultError, InfiniteData, InfiniteQueryObserverOptions,
  MutationObserverOptions, MutateOptions, QueryClient, QueryKey, QueryObserverOptions,
} from '@tanstack/query-core'
import type {
  CreateQueryOptions, CreateInfiniteQueryOptions, CreateMutationOptions,
  EffectorQueryKey, QueryResult, InfiniteQueryResult, MutationResult,
} from '../packages/core/src/types'

export type OptionsSource = Store<unknown> | Readonly<Record<string, Store<unknown>>>
export type SourceValue<S extends OptionsSource> = S extends Store<infer V>
  ? V
  : { -readonly [P in keyof S]: S[P] extends Store<infer V> ? V : never }

type InlineOnly = { source?: never; query?: never; mutation?: never }
type ForbidFields<T, Allowed extends PropertyKey = never> = {
  [P in Exclude<keyof T, Allowed>]?: never
}
type QueryOverrides<Interval> = {
  name?: string
  enabled?: boolean | Store<boolean> | undefined
  refetchInterval?: Interval | Store<number | false | undefined>
}

export type CreateQueryFactoryOptions<
  S extends OptionsSource, F = unknown, E = DefaultError,
  D = F, K extends QueryKey = QueryKey,
> = {
  source: S
  query: (source: SourceValue<S>) => QueryObserverOptions<F, E, D, F, K>
  mutation?: never
} & QueryOverrides<QueryObserverOptions<NoInfer<F>, NoInfer<E>, NoInfer<D>, NoInfer<F>, NoInfer<K>>['refetchInterval']>
  & ForbidFields<QueryObserverOptions, 'enabled' | 'refetchInterval'>

export type CreateInfiniteQueryFactoryOptions<
  S extends OptionsSource, F = unknown, E = DefaultError,
  P = unknown, D = InfiniteData<F, P>, K extends QueryKey = QueryKey,
> = {
  source: S
  query: (source: SourceValue<S>) => InfiniteQueryObserverOptions<F, E, D, K, P>
  mutation?: never
} & QueryOverrides<InfiniteQueryObserverOptions<NoInfer<F>, NoInfer<E>, NoInfer<D>, NoInfer<K>, NoInfer<P>>['refetchInterval']>
  & ForbidFields<InfiniteQueryObserverOptions, 'enabled' | 'refetchInterval'>

// Declaration-only prototype. No adapter runtime is implemented here.
// Keep legacy generic order/defaults; add source-first factory overloads.
export declare function createQuery<F = unknown, E = Error, D = F, const K extends EffectorQueryKey = EffectorQueryKey>(
  options: CreateQueryOptions<F, E, D, K> & InlineOnly,
): QueryResult<D, E>
export declare function createQuery<F = unknown, E = Error, D = F, const K extends EffectorQueryKey = EffectorQueryKey>(
  client: QueryClient, options: CreateQueryOptions<F, E, D, K> & InlineOnly,
): QueryResult<D, E>
export declare function createQuery<const S extends OptionsSource, F = unknown, E = DefaultError, D = F, const K extends QueryKey = QueryKey>(
  options: CreateQueryFactoryOptions<S, F, E, D, K>,
): QueryResult<D, E>
export declare function createQuery<const S extends OptionsSource, F = unknown, E = DefaultError, D = F, const K extends QueryKey = QueryKey>(
  client: QueryClient, options: CreateQueryFactoryOptions<S, F, E, D, K>,
): QueryResult<D, E>

export declare function createInfiniteQuery<F = unknown, E = Error, P = unknown, D = InfiniteData<F, P>, const K extends EffectorQueryKey = EffectorQueryKey>(
  options: CreateInfiniteQueryOptions<F, E, P, D, K> & InlineOnly,
): InfiniteQueryResult<D, E, P>
export declare function createInfiniteQuery<F = unknown, E = Error, P = unknown, D = InfiniteData<F, P>, const K extends EffectorQueryKey = EffectorQueryKey>(
  client: QueryClient, options: CreateInfiniteQueryOptions<F, E, P, D, K> & InlineOnly,
): InfiniteQueryResult<D, E, P>
export declare function createInfiniteQuery<const S extends OptionsSource, F = unknown, E = DefaultError, P = unknown, D = InfiniteData<F, P>, const K extends QueryKey = QueryKey>(
  options: CreateInfiniteQueryFactoryOptions<S, F, E, P, D, K>,
): InfiniteQueryResult<D, E, P>
export declare function createInfiniteQuery<const S extends OptionsSource, F = unknown, E = DefaultError, P = unknown, D = InfiniteData<F, P>, const K extends QueryKey = QueryKey>(
  client: QueryClient, options: CreateInfiniteQueryFactoryOptions<S, F, E, P, D, K>,
): InfiniteQueryResult<D, E, P>

export declare function createMutation<D = unknown, E = Error, V = void, C = unknown>(
  options: CreateMutationOptions<D, E, V, C> & InlineOnly,
): MutationResult<D, E, V>
export declare function createMutation<D = unknown, E = Error, V = void, C = unknown>(
  client: QueryClient, options: CreateMutationOptions<D, E, V, C> & InlineOnly,
): MutationResult<D, E, V>
// Existential validation only: inferred O is retained, not widened to these anys.
type MutationDefinition = MutationObserverOptions<any, any, any, any>
export type MutationFactoryResult<D, E, V, C> = Omit<MutationResult<D, E, V>, 'mutateWith'> & {
  mutateWith: EventCallable<{ variables: V } & Pick<MutateOptions<D, E, V, C>, 'onSuccess' | 'onError' | 'onSettled'>>
}
type MutationVariables<O, V> = O extends { mutationFn: (...args: infer Args) => unknown }
  ? Args extends [] ? void : V
  : V
type MutationError<O, E> = 'onError' extends keyof O ? E
  : 'onSettled' extends keyof O ? E
  : 'throwOnError' extends keyof O ? E
  : DefaultError
type InferMutationResult<O> = O extends MutationObserverOptions<infer D, infer E, infer V, infer C>
  ? MutationFactoryResult<D, MutationError<O, E>, MutationVariables<O, V>, C>
  : never
export type CreateMutationFactoryOptions<S extends OptionsSource, O extends object> = {
  name?: string
  source: S
  mutation: (source: SourceValue<S>) => O
  query?: never
} & ForbidFields<MutationObserverOptions> & NoInfer<O extends MutationDefinition ? unknown : never>

export declare function createMutation<const S extends OptionsSource, O extends object>(
  options: CreateMutationFactoryOptions<S, O>,
): InferMutationResult<O>
export declare function createMutation<const S extends OptionsSource, O extends object>(
  client: QueryClient, options: CreateMutationFactoryOptions<S, O>,
): InferMutationResult<O>
