import type {
  DefaultError,
  InfiniteData,
  InfiniteQueryObserverOptions,
  MutationObserverOptions,
  QueryKey,
  QueryObserverOptions,
} from '@tanstack/query-core'

// Local aliases preserve the upstream helper structure without React-only
// `subscribed` or an import from @tanstack/react-query.
export type UseQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>, 'suspense'>

export type UseInfiniteQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = Omit<InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>, 'suspense'>

export type UseMutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
> = Omit<MutationObserverOptions<TData, TError, TVariables, TOnMutateResult>, '_defaulted'>
