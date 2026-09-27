---
title: createInfiniteQuery
description: Create a paginated query with cursor-based or bidirectional pagination.
---

Creates a query model with Effector stores and events for loading multiple pages.
Define the query **inline** or connect an options **factory** to reactive parameters.

## Usage

### Inline

```ts
import { createStore } from 'effector'
import { createInfiniteQuery } from '@effector-tanstack-query/core'

type Post = { id: number; title: string }
type PostsPage = { items: Post[]; nextCursor: number | null }

declare function getPosts(
  params: { category: string; cursor: number },
  options?: { signal?: AbortSignal },
): Promise<PostsPage>

const $category = createStore('books')

const postsQuery = createInfiniteQuery({
  name: 'posts',
  queryKey: ['posts', $category],
  initialPageParam: 0,
  queryFn: ({ queryKey: [, category], pageParam, signal }) =>
    getPosts({ category, cursor: pageParam }, { signal }),
  getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
})
```

The store in `queryKey` resolves to its current value. Including category in the
key keeps each category's pages in a separate cache entry.

### Factory

```ts
import { createStore } from 'effector'
import { createInfiniteQuery } from '@effector-tanstack-query/core'
import { postsOptions } from './queries'

const $category = createStore('books')

const postsQuery = createInfiniteQuery({
  name: 'posts',
  source: { category: $category },
  query: postsOptions,
})
```

`postsOptions` receives `{ category: string }` and returns infinite query options,
including the key, page function and cursor callbacks. See its
[definition in the guide](/effector-tanstack-query/guides/infinite-queries/#define-the-pages).
When `$category` changes, the adapter reruns the factory and applies all returned
options.

Pass an existing compatible factory directly as `query`; no additional helper
wrapper is needed.

## Signature

Call `createInfiniteQuery(options)` to use `$queryClient` from the Effector scope,
or `createInfiniteQuery(queryClient, options)` to use an explicit client. See
[QueryClient and activation](/effector-tanstack-query/api/create-query/#queryclient-and-activation)
for setup and ownership.

Types are usually inferred from the source, query function and options:

| Parameter | Meaning |
| --- | --- |
| `TQueryFnData` | Data returned by the query function for one page |
| `TError` | Query error |
| `TPageParam` | Parameter used to fetch a page |
| `TData` | Model data after `select`; defaults to `InfiniteData<TQueryFnData, TPageParam>` |
| `TQueryKey` | Query key type |
| `TSource` | Factory source type: a store or an object of stores |
| `TFactoryData` | Factory result before a consumer selector overrides it |

The factory receives `SourceValue<TSource>`: for example,
`{ category: Store<string> }` becomes `{ category: string }`.
The overloads below show the generic order and defaults. Inline uses `Error` as
its default error type; factory uses TanStack's `DefaultError`, which follows
`Register.defaultError` when configured.

<details>
<summary>Inline overloads</summary>

```ts
declare function createInfiniteQuery<
  TQueryFnData = unknown,
  TError = Error,
  TPageParam = unknown,
  TData = InfiniteData<TQueryFnData, TPageParam>,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  options: CreateInfiniteQueryOptions<
    TQueryFnData,
    TError,
    TPageParam,
    TData,
    TQueryKey
  >,
): InfiniteQueryResult<TData, TError, TPageParam>

declare function createInfiniteQuery<
  TQueryFnData = unknown,
  TError = Error,
  TPageParam = unknown,
  TData = InfiniteData<TQueryFnData, TPageParam>,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  queryClient: QueryClient,
  options: CreateInfiniteQueryOptions<
    TQueryFnData,
    TError,
    TPageParam,
    TData,
    TQueryKey
  >,
): InfiniteQueryResult<TData, TError, TPageParam>
```

</details>

<details>
<summary>Factory overloads</summary>

The general signatures below accept an optional consumer selector. More specific
overloads infer the factory result when `select` is absent, and the consumer
result when it is a definite function. A function-or-`undefined` override keeps
the union of both results.

```ts
declare function createInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TPageParam = unknown,
  TData = InfiniteData<TQueryFnData, TPageParam>,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
  TFactoryData = InfiniteData<TQueryFnData, TPageParam>,
>(
  options: CreateInfiniteQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TPageParam,
    TData,
    TQueryKey,
    TFactoryData
  >,
): InfiniteQueryResult<TData | TFactoryData, TError, TPageParam>

declare function createInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TPageParam = unknown,
  TData = InfiniteData<TQueryFnData, TPageParam>,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
  TFactoryData = InfiniteData<TQueryFnData, TPageParam>,
>(
  queryClient: QueryClient,
  options: CreateInfiniteQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TPageParam,
    TData,
    TQueryKey,
    TFactoryData
  >,
): InfiniteQueryResult<TData | TFactoryData, TError, TPageParam>
```

</details>

Inferred types also depend on the factory's return type. Some
[`infiniteQueryOptions` overloads](/effector-tanstack-query/api/query-options/#infinitequeryoptions)
use `unknown` for cached `pageParams`, even when the query function receives a
typed `pageParam`.

## Options

Pass pagination options directly in the inline definition or return them from
the factory:

| Field | Type | Behavior |
| --- | --- | --- |
| `initialPageParam` | `TPageParam` | Required parameter for the first page |
| `queryFn` | `(context: QueryFunctionContext<TQueryKey, TPageParam>) => TQueryFnData \| Promise<TQueryFnData>` | Loads one page; receives `pageParam`, the resolved `queryKey` and `signal`. Can also come from QueryClient defaults |
| `getNextPageParam` | `GetNextPageParamFunction<TPageParam, TQueryFnData>` | Required; `null` or `undefined` ends forward pagination |
| `getPreviousPageParam` | `GetPreviousPageParamFunction<TPageParam, TQueryFnData>` | Optional; `null` or `undefined` ends backward pagination |
| `maxPages` | `number` | Limits retained pages; loading beyond the limit removes a page from the opposite end. `0` or omission means no limit |

The cursor callbacks receive `(lastPage, allPages, lastPageParam, allPageParams)`
and `(firstPage, allPages, firstPageParam, allPageParams)`, respectively. Both
return `TPageParam | null | undefined`.

`TPageParam` connects the initial parameter, `queryFn`'s `pageParam` and the
cursor callbacks. It can be a number, string or another cursor type.
For inline keys, the query function's context uses `ResolvedQueryKey<TQueryKey>`:
stores in the key become their values.

### Query and adapter options

| Field | Accepted values | Behavior |
| --- | --- | --- |
| `queryKey` | Inline: `EffectorQueryKey`; factory result: `TQueryKey extends QueryKey` | Identifies the cached page set. Inline keys resolve stores at the top level of the array |
| `name` | `string` | Gives model stores stable SIDs for SSR; use a unique name per model |
| `enabled` | `boolean` or `Store<boolean>` | Controls automatic fetching; defaults to `true` |
| `refetchInterval` | Milliseconds, `false`, a TanStack interval callback, or `Store<number \| false \| undefined>` | Controls polling; `false` stops it |
| `source` | `OptionsSource`: a store or shallow object of stores | Supplies reactive parameters to the factory; use `{}` when there are no parameters |
| `query` | `(source: SourceValue<TSource>) => options` | Returns infinite query options from plain source values |

`CreateInfiniteQueryOptions` accepts TanStack infinite observer options with
reactive `queryKey`, `enabled` and `refetchInterval`.

Factory consumers can override `select`, `placeholderData`, `staleTime`,
`refetchOnMount`, `refetchOnWindowFocus`, `refetchOnReconnect`,
`refetchIntervalInBackground` and `retryOnMount`, as well as `enabled` and
`refetchInterval`. See the shared [override contract](/effector-tanstack-query/api/create-query/#factory-overrides)
for precedence, native types and store support.

Here, selectors and placeholder callbacks use
`InfiniteData<TQueryFnData, TPageParam>` before selection. A top-level selector
replaces the factory selector; pagination continues to use the raw cached pages.
Pagination settings and other query settings, such as `retry` and `gcTime`, stay
in the factory result.

The adapter uses boolean `enabled`; if a native factory supplies a callback,
provide a boolean override. Use `combine` for derived conditions.

## Return value

Returns `InfiniteQueryResult<TData, TError, TPageParam>`, with
`$data: Store<TData | undefined>`. Without `select`, the data contains the loaded
pages and the parameters used to fetch them:

```ts
{
  pages: [/* results returned by queryFn */],
  pageParams: [/* corresponding page parameters */],
}
```

In addition to the [query stores and events](/effector-tanstack-query/api/create-query/#return-value-queryresulttdata-terror):

| Field | Type | Description |
| --- | --- | --- |
| `$hasNextPage` | `Store<boolean>` | More pages forward |
| `$hasPreviousPage` | `Store<boolean>` | More pages backward |
| `$isFetchingNextPage` | `Store<boolean>` | Next page in flight |
| `$isFetchingPreviousPage` | `Store<boolean>` | Previous page in flight |
| `$isFetchNextPageError` | `Store<boolean>` | Next page errored |
| `$isFetchPreviousPageError` | `Store<boolean>` | Previous page errored |
| `fetchNextPage` | `EventCallable<void>` | Fetch the next page |
| `fetchPreviousPage` | `EventCallable<void>` | Fetch the previous page |
| `prefetch` | `EventCallable<void>` | Fetch or reuse cached pages through `queryClient.fetchInfiniteQuery` |
| `$observer` | `Store<InfiniteQueryObserver<any, TError, TData, QueryKey, TPageParam> \| null>` | Per-scope infinite query observer; created on mount |
| `finished` | `{ success: Event<TData>; failure: Event<TError> }` | Lifecycle events carrying selected data or an error |

`finished.success` carries the full selected data, including updates from page
loads. Emission follows the shared
[lifecycle event rules](/effector-tanstack-query/api/create-query/#lifecycle-events).

`await allSettled(postsQuery.prefetch, { scope })` waits for prefetch to finish.
Prefetch is skipped when `enabled` is false. Without a mounted observer it fills
the cache but does not populate model stores or emit lifecycle events. For SSR
loading that also populates stores, use
[`prefetchQueries`](/effector-tanstack-query/api/prefetch-queries/).

Pagination events require a mounted observer and must be dispatched in its
scope. React query hooks manage mounting automatically. See the
[loading more recipe](/effector-tanstack-query/guides/infinite-queries/#loading-more)
for connecting a button and handling loading states.

## Select

Flatten the loaded pages into a list:

```ts
select: data => data.pages.flatMap(page => page.items)
```

Place `select` on the model or include it in a reusable factory. The resulting `$data` is `Store<Post[] | undefined>`; the cache retains
the original page set. See [selecting a flat list](/effector-tanstack-query/guides/infinite-queries/#select-a-flat-list)
for a complete factory composition example.

## Refetch and cancellation

`refresh()` invalidates matching queries through `queryClient.invalidateQueries`.
Active, enabled queries refetch retained pages in order. You can also call
`queryClient.invalidateQueries` directly. Subsequent cursors are computed from
fresh results using `getNextPageParam`. With `maxPages`, only retained pages are
refetched.

Pass `signal` in the request options, as in the examples. When the last observer
leaves a cache entry after a key change or unmount, TanStack can abort the consumed
signal. A request still needed by another observer remains active. Use
[`createCancel`](/effector-tanstack-query/api/cache-actions/) for explicit
cancellation; see the shared [cancellation rules](/effector-tanstack-query/api/create-query/#cancellation).
