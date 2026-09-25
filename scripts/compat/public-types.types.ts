import type * as Old from '@baseline/core'
import type * as New from '@subject/core'
import type { Store } from 'effector'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
type Assert<T extends true> = T
class CustomError extends Error {
  code = 'application'
}
type Raw = { id: number; title: string }
type Key = readonly ['todos', Store<number>, { readonly language: string }]

// Compare the complete existing public contracts, not only a few successful
// call sites. New factory overloads are additive; the final inline overload
// used by Parameters/ReturnType must keep its prior meaning.
export type InlineContracts = [
  Assert<Equal<Old.EffectorQueryKey, New.EffectorQueryKey>>,
  Assert<Equal<Old.StoreOrValue<Raw>, New.StoreOrValue<Raw>>>,
  Assert<Equal<Old.CreateQueryOptions, New.CreateQueryOptions>>,
  Assert<
    Equal<
      Old.CreateQueryOptions<Raw, CustomError, string, Key>,
      New.CreateQueryOptions<Raw, CustomError, string, Key>
    >
  >,
  Assert<Equal<Old.CreateInfiniteQueryOptions, New.CreateInfiniteQueryOptions>>,
  Assert<
    Equal<
      Old.CreateInfiniteQueryOptions<Raw, CustomError, number, string[], Key>,
      New.CreateInfiniteQueryOptions<Raw, CustomError, number, string[], Key>
    >
  >,
  Assert<
    Equal<
      Old.QueryResult<string, CustomError>,
      New.QueryResult<string, CustomError>
    >
  >,
  Assert<
    Equal<
      Old.InfiniteQueryResult<string[], CustomError, number>,
      New.InfiniteQueryResult<string[], CustomError, number>
    >
  >,
  Assert<
    Equal<
      Parameters<typeof Old.createQuery>,
      Parameters<typeof New.createQuery>
    >
  >,
  Assert<
    Equal<
      ReturnType<typeof Old.createQuery>,
      ReturnType<typeof New.createQuery>
    >
  >,
  Assert<
    Equal<
      Parameters<typeof Old.createQuery<Raw, CustomError, string, Key>>,
      Parameters<typeof New.createQuery<Raw, CustomError, string, Key>>
    >
  >,
  Assert<
    Equal<
      ReturnType<typeof Old.createQuery<Raw, CustomError, string, Key>>,
      ReturnType<typeof New.createQuery<Raw, CustomError, string, Key>>
    >
  >,
  Assert<
    Equal<
      Parameters<typeof Old.createInfiniteQuery>,
      Parameters<typeof New.createInfiniteQuery>
    >
  >,
  Assert<
    Equal<
      ReturnType<typeof Old.createInfiniteQuery>,
      ReturnType<typeof New.createInfiniteQuery>
    >
  >,
  Assert<
    Equal<
      Parameters<
        typeof Old.createInfiniteQuery<Raw, CustomError, number, string[], Key>
      >,
      Parameters<
        typeof New.createInfiniteQuery<Raw, CustomError, number, string[], Key>
      >
    >
  >,
  Assert<
    Equal<
      ReturnType<
        typeof Old.createInfiniteQuery<Raw, CustomError, number, string[], Key>
      >,
      ReturnType<
        typeof New.createInfiniteQuery<Raw, CustomError, number, string[], Key>
      >
    >
  >,
  Assert<Equal<Old.PrefetchableQuery, New.PrefetchableQuery>>,
  Assert<Equal<Old.PrefetchQueriesConfig, New.PrefetchQueriesConfig>>,
  Assert<Equal<typeof Old.prefetchQueries, typeof New.prefetchQueries>>,
  Assert<Equal<typeof Old.createQueries, typeof New.createQueries>>,
]
