---
title: createInfiniteQuery
description: Define an infinite query inline or with an options factory, and load pages through Effector events.
---

Creates a query model for a list of pages. Use **inline** options or an options
**factory** with a reactive `source`. Both forms return `InfiniteQueryResult`
with query state and pagination events.

## Usage

The examples below load posts by category. They share this store and API function:

```ts
import { createStore } from 'effector'

type Post = { id: number; title: string }
type PostsPage = { items: Post[]; nextCursor: number | null }
const $category = createStore('books')

async function fetchPosts({ category, cursor, signal }: {
  category: string
  cursor: number
  signal: AbortSignal
}): Promise<PostsPage> {
  const params = new URLSearchParams({ category, cursor: String(cursor) })
  const response = await fetch(`/api/posts?${params}`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
```

### Inline

Define the key, page function and cursor options in the model:

```ts
import { createInfiniteQuery } from '@effector-tanstack-query/core'

const postsQuery = createInfiniteQuery({
  name: 'posts',
  queryKey: ['posts', $category],
  initialPageParam: 0,
  queryFn: ({ queryKey: [, category], pageParam, signal }) =>
    fetchPosts({ category, cursor: pageParam, signal }),
  getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  staleTime: 60_000,
})
```

Stores at the top level of `queryKey` resolve to ordinary values. The category
is part of the key, so each category has its own cached page set.

<a id="factory-form"></a>

### Factory

Define reusable page options in a function, then connect its parameters to stores:

```ts
import {
  createInfiniteQuery,
  infiniteQueryOptions,
} from '@effector-tanstack-query/core'

const postsOptions = ({ category }: { category: string }) => infiniteQueryOptions({
  queryKey: ['posts', category],
  initialPageParam: 0,
  queryFn: ({ pageParam, signal }) => fetchPosts({ category, cursor: pageParam, signal }),
  getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  staleTime: 60_000,
})

const postsQuery = createInfiniteQuery({
  name: 'posts',
  source: { category: $category },
  query: postsOptions,
})
```

When `$category` changes, `postsOptions` receives the new category as a string.
The adapter applies all returned options, including the page function and cursor
callbacks. Including category in the key separates its pages from other categories.

[`infiniteQueryOptions`](/effector-tanstack-query/api/query-options/) is optional.
A factory can return a plain options object or use the native React Query helper.
The same factory can be used with `queryClient.fetchInfiniteQuery` or a native
`useInfiniteQuery` hook.

### QueryClient and activation

Both forms accept `createInfiniteQuery(options)` or
`createInfiniteQuery(queryClient, options)`. An explicit client takes precedence;
otherwise the model uses `$queryClient` from its Effector scope.

Call `mounted` before driving pagination and `unmounted` when the consumer is
finished. React hooks manage these events automatically. For scoped applications,
dispatch into the owning scope. See
[QueryClient and activation](/effector-tanstack-query/api/create-query/#queryclient-and-activation)
for setup and shared ownership.

## Options

### Shared options

| Field | Accepted values | Behavior |
| --- | --- | --- |
| `name` | `string` | Stable SIDs for model stores; use a unique name per model |
| `enabled` | `boolean` or `Store<boolean>` | Controls automatic fetching |
| `refetchInterval` | Number of milliseconds, `false`, a TanStack interval callback, or `Store<number \| false \| undefined>` | Sets polling; `false` stops it |

In the factory form, defined top-level `enabled` and `refetchInterval` values
replace the factory values. `undefined` inherits; `false` overrides. Use
`combine` to derive a boolean condition; native callback `enabled` is not evaluated.

### Inline options

`CreateInfiniteQueryOptions` accepts TanStack infinite observer options. Its
`queryKey` resolves top-level stores, and enabled/polling can be stores.
Pass the pagination options below directly in the model definition.

### Factory options

| Field | Behavior |
| --- | --- |
| `source` | Required store or shallow object of stores |
| `query` | Required pure, synchronous function receiving plain source values and returning infinite query options |

Use `source: $category` with `query: category => postsOptions({ category })`, or
the store shape shown above. Use `source: {}` for a factory without parameters.
Put pagination options, `select` and other TanStack options in the factory result.
The factory runs during options resolution, including while disabled; network
work belongs in `queryFn`.

### Pagination options

| Field | Behavior |
| --- | --- |
| `queryKey` | Identifies the cached page set; include parameters such as category or filters |
| `queryFn` | Loads one page using `pageParam`, the resolved key and `signal`; can also come from QueryClient defaults |
| `initialPageParam` | Required value passed to `queryFn` for the first page |
| `getNextPageParam` | Required callback `(lastPage, allPages, lastPageParam, allPageParams)` returning the next cursor; `null` or `undefined` means no next page |
| `getPreviousPageParam` | Optional callback `(firstPage, allPages, firstPageParam, allPageParams)` returning the previous cursor for bidirectional pagination |
| `maxPages` | Limits the retained pages; loading beyond the limit removes a page from the opposite end |
| Other TanStack options | `select`, `staleTime`, `retry`, `placeholderData`, `meta`, etc. |

Option updates and notification behavior follow
[`createQuery`](/effector-tanstack-query/api/create-query/#option-updates-and-notifications):
inline updates its reactive key/enabled/polling fields; factory applies the whole
result and uses complete observer notifications. A factory selector-only change
updates the projection without forcing a fetch.

## Return value

Both forms return `InfiniteQueryResult<TData, TError, TPageParam>`. Without
`select`, `$data` contains `{ pages, pageParams }`, or `undefined` before the model
has data. Each `pages` entry is the result of one query function call.

In addition to the [query stores and events](/effector-tanstack-query/api/create-query/#return-value-queryresulttdata-terror):

| Field                       | Type                  | Description                  |
| --------------------------- | --------------------- | ---------------------------- |
| `$hasNextPage`              | `Store<boolean>`      | More pages forward           |
| `$hasPreviousPage`          | `Store<boolean>`      | More pages backward          |
| `$isFetchingNextPage`       | `Store<boolean>`      | Next page in flight          |
| `$isFetchingPreviousPage`   | `Store<boolean>`      | Previous page in flight      |
| `$isFetchNextPageError`     | `Store<boolean>`      | Next page errored            |
| `$isFetchPreviousPageError` | `Store<boolean>`      | Previous page errored        |
| `fetchNextPage`             | `EventCallable<void>` | Trigger next-page fetch      |
| `fetchPreviousPage`         | `EventCallable<void>` | Trigger previous-page fetch  |
| `prefetch`                  | `EventCallable<void>` | `queryClient.fetchInfiniteQuery` + awaits; for SSR — see [`createQuery#prefetch-vs-mounted`](/effector-tanstack-query/api/create-query/#prefetch-vs-mounted) |


`finished.success` carries the full selected data, rather than an individual
page. It follows the same [lifecycle event rules](/effector-tanstack-query/api/create-query/#lifecycle-events)
as `createQuery`, including the mount baseline and timestamp/notification limits.

## Loading pages

Once mounted, use `fetchNextPage` or `fetchPreviousPage`. In an Effector model,
connect a UI event and guard against unavailable pages or an active request:

```ts
import { combine, createEvent, sample } from 'effector'

const loadMoreClicked = createEvent()
const $canLoadMore = combine(
  postsQuery.$hasNextPage,
  postsQuery.$isFetching,
  (hasNextPage, isFetching) => hasNextPage && !isFetching,
)

sample({
  clock: loadMoreClicked,
  filter: $canLoadMore,
  target: postsQuery.fetchNextPage,
})
```

Dispatch `loadMoreClicked` from the same scope as the mounted model. Pagination
events have no effect when the model has no observer. To await a server-side
load, use `prefetch` or [`prefetchQueries`](/effector-tanstack-query/api/prefetch-queries/).

## Select

Use `select` to turn the page set into the data your consumer needs. In a factory
consumer, compose it with the shared options:

```ts
const postListQuery = createInfiniteQuery({
  name: 'post-list',
  source: $category,
  query: (category: string) => ({
    ...postsOptions({ category }),
    select: data => data.pages.flatMap(page => page.items),
  }),
})
// postListQuery.$data: Store<Post[] | undefined>
```

For inline, put the same selector directly in `createInfiniteQuery` options.
The cache retains the original page set; selection only changes this model's data.
See [composing select](/effector-tanstack-query/guides/queries/#composing-select)
for inference guidance.

## Cancellation

Pass the native `signal` to the page request, as in the examples. Requests follow
TanStack's signal cancellation rules when the last observer leaves a cache entry.
Use [`createCancel`](/effector-tanstack-query/api/cache-actions/) to cancel explicitly.

## Refetch behavior

For an active, enabled query, `refresh()` invalidates the key and refetches the
retained pages in order. TanStack computes subsequent cursors using fresh page
results and `getNextPageParam`. With `maxPages`, only retained pages are refetched.

## Types

Both forms infer page data, selected data and page parameters from the options.
Inline accepts explicit generics in the order
`<TQueryFnData, TError, TPageParam, TData, TQueryKey>`. Without `select`, `TData`
defaults to `InfiniteData<TQueryFnData, TPageParam>`.

Inline's error type defaults to `Error`; factory options use TanStack's
`DefaultError` unless another error type is inferred. See the
[options helpers reference](/effector-tanstack-query/api/query-options/)
for typed cache access and the page-parameter type carried by tagged keys.
