---
title: queryOptions / infiniteQueryOptions
description: Define reusable query options with inferred data types and typed cache keys.
---

These optional helpers infer query options and associate the key with its cache
data type. They depend only on TanStack Query Core. Existing compatible factories
can keep their native helper import and be passed directly to Effector adapters.

## queryOptions

```ts
import { queryOptions } from '@effector-tanstack-query/core'
// or: import { queryOptions } from '@tanstack/react-query'

type Todo = { id: number; title: string }

declare function getTodo(
  params: { todoId: number },
  options?: { signal?: AbortSignal },
): Promise<Todo>

const todoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: ['todos', { todoId }],
  queryFn: ({ signal }) => getTodo({ todoId }, { signal }),
  staleTime: 60_000,
})
```

The query function's data type is inferred from `getTodo`.

## infiniteQueryOptions

```ts
import { infiniteQueryOptions } from '@effector-tanstack-query/core'
// or: import { infiniteQueryOptions } from '@tanstack/react-query'

type Post = { id: number; title: string }
type PostsPage = { items: Post[]; nextCursor: number | null }

declare function getPosts(
  params: { category: string; cursor: number },
  options?: { signal?: AbortSignal },
): Promise<PostsPage>

const postsOptions = ({ category }: { category: string }) => infiniteQueryOptions({
  queryKey: ['posts', category],
  initialPageParam: 0,
  queryFn: ({ pageParam, signal }) =>
    getPosts({ category, cursor: pageParam }, { signal }),
  getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
})
```

`initialPageParam` and the page options infer the query function's `pageParam`;
`getPosts` supplies the page data type used by `getNextPageParam`.

See [reusing factories](/effector-tanstack-query/guides/queries/#reusing-query-options-factories)
for QueryClient, native React and Effector consumers, and the
[infinite query guide](/effector-tanstack-query/guides/infinite-queries/) for pagination.

## Signature

| Parameter | Meaning |
| --- | --- |
| `TQueryFnData` | Query function result; one page for infinite queries |
| `TError` | Error type; defaults to TanStack's `DefaultError` |
| `TData` | Selected data; defaults to raw data or `InfiniteData<TQueryFnData>` |
| `TQueryKey` | Key type; defaults to `QueryKey` |
| `TPageParam` | Infinite query page parameter; defaults to `unknown` |

The helper generic order differs from the adapter generic order. The overloads
below show the exact defaults and the variants for initial data and skip tokens.
The `*Options` names below refer to internal types used in the declarations.
Consumer types are normally inferred from the factory.

<details>
<summary>queryOptions overloads</summary>

```ts
declare function queryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}

declare function queryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UnusedSkipTokenOptions<TQueryFnData, TError, TData, TQueryKey>,
): UnusedSkipTokenOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}

declare function queryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>
}
```

</details>

<details>
<summary>infiniteQueryOptions overloads</summary>

```ts
declare function infiniteQueryOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: DefinedInitialDataInfiniteOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
): DefinedInitialDataInfiniteOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey,
  TPageParam
> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>
}

declare function infiniteQueryOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UnusedSkipTokenInfiniteOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
): UnusedSkipTokenInfiniteOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey,
  TPageParam
> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>
}

declare function infiniteQueryOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UndefinedInitialDataInfiniteOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
): UndefinedInitialDataInfiniteOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey,
  TPageParam
> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>
}
```

</details>

## Return value

Returns the same options object passed to the helper. The helper does not clone
it, create a client or start a request. At the type level, `queryKey` carries a
TanStack `DataTag` associating it with the query function's data and error types.
No runtime tags are added.

| Helper | Cache data associated with the key |
| --- | --- |
| `queryOptions` | `TQueryFnData` |
| `infiniteQueryOptions` | `InfiniteData<TQueryFnData>` |

## Typed cache access

Using `todoOptions` from the first example:

```ts
import { QueryClient } from '@tanstack/query-core'

const queryClient = new QueryClient()
const key = todoOptions({ todoId: 1 }).queryKey

queryClient.getQueryData(key)
// Todo | undefined

queryClient.setQueryData(key, previous =>
  previous ? { ...previous, title: 'Updated' } : previous,
)
// previous: Todo | undefined
```

The key describes raw cache data even when a consumer uses `select`. A selector
returning `todo.title` gives that consumer a string; the cache still holds `Todo`.
An infinite query key describes the entire `InfiniteData` page set.

## Inference and compatibility

- Overloads preserve the options' initial-data and skip-token types. They do not
  change the consumer's lifecycle: Effector `$data` still includes `undefined`
  before the observer populates the model.
- The infinite helper's data tag uses `InfiniteData<TQueryFnData>`, whose
  `pageParams` are `unknown[]`. This does not make a query function's inferred
  `pageParam` unknown. Selected data types also depend on the chosen overload.
- TanStack `Register` query keys, metadata and default errors are respected where
  supported by the installed Query Core version.
- Effector accepts boolean `enabled`. A factory returning a native enabled
  callback needs a boolean override at the adapter; see
  [adapter options](/effector-tanstack-query/api/create-query/#shared-options).
- Factories exchange ordinary values. Native React Query factories are supported;
  Vue helper/ref integration is outside the supported contract. Other framework
  helpers have not been verified.

The supported Query Core range remains `^5.0.0`. Error tags and `skipToken` require
versions providing those features. Keep native TanStack packages on matching
versions when sharing definitions.

## Attribution

Declarations are adapted from TanStack React Query 5.100.10. Its MIT license is
included in the core package as `LICENSE.TanStack`.
