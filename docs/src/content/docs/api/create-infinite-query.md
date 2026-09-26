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

declare function fetchPosts(params: {
  category: string
  cursor: number
  signal: AbortSignal
}): Promise<{ items: Post[]; nextCursor: number | null }>

const $category = createStore('books')

const postsQuery = createInfiniteQuery({
  name: 'posts',
  queryKey: ['posts', $category],
  initialPageParam: 0,
  queryFn: ({ queryKey: [, category], pageParam, signal }) =>
    fetchPosts({ category, cursor: pageParam, signal }),
  getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
})
```

The store in `queryKey` resolves to its current value. Including category in the
key keeps each category's pages in a separate cache entry.

<a id="factory-form"></a>

### Factory

```ts
import { createStore } from 'effector'
import { createInfiniteQuery, infiniteQueryOptions } from '@effector-tanstack-query/core'

type Post = { id: number; title: string }

declare function fetchPosts(params: {
  category: string
  cursor: number
  signal: AbortSignal
}): Promise<{ items: Post[]; nextCursor: number | null }>

const $category = createStore('books')

const postsOptions = ({ category }: { category: string }) =>
  infiniteQueryOptions({
    queryKey: ['posts', category],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchPosts({ category, cursor: pageParam, signal }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  })

const postsQuery = createInfiniteQuery({
  name: 'posts',
  source: { category: $category },
  query: postsOptions,
})
```

The factory receives `{ category: string }` and runs again when `$category`
changes. The adapter applies all returned options, including the page function
and cursor callbacks.

[`infiniteQueryOptions`](/effector-tanstack-query/api/query-options/) is optional.
An existing factory using the native React Query helper or returning plain options
can be passed directly as `query`.

## Options

Pass pagination options directly in the inline definition or return them from
the factory:

| Field | Behavior |
| --- | --- |
| `initialPageParam` | Required parameter for the first page |
| `queryFn` | Loads one page using `pageParam`, the resolved key and `signal`; can also come from QueryClient defaults |
| `getNextPageParam` | Required callback `(lastPage, allPages, lastPageParam, allPageParams)` returning the next parameter; `null` or `undefined` ends forward pagination |
| `getPreviousPageParam` | Optional callback `(firstPage, allPages, firstPageParam, allPageParams)` returning the previous parameter; `null` or `undefined` ends backward pagination |
| `maxPages` | Limits retained pages; loading beyond the limit removes a page from the opposite end |

`name`, `enabled`, `refetchInterval` and the factory's `source` follow the
[`createQuery` options rules](/effector-tanstack-query/api/create-query/#options).
Top-level enabled/polling values override factory values; `undefined` inherits.
Other TanStack options, such as `select` and `staleTime`, go in the inline options
or factory result.

Pass an explicit client with `createInfiniteQuery(queryClient, options)`.
Otherwise the model uses `$queryClient` from the Effector scope. See
[QueryClient and activation](/effector-tanstack-query/api/create-query/#queryclient-and-activation)
for setup and ownership.

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

`finished.success` carries the full selected data and follows the shared
[lifecycle event rules](/effector-tanstack-query/api/create-query/#lifecycle-events).
For awaited SSR loading, use `prefetch` or
[`prefetchQueries`](/effector-tanstack-query/api/prefetch-queries/).

## Loading pages

The model must be mounted before pagination events can load pages. React hooks
manage mounting automatically. Connect a UI event through `sample`:

```ts
import { createEvent, sample } from 'effector'

const loadMoreClicked = createEvent()

sample({
  clock: loadMoreClicked,
  filter: postsQuery.$hasNextPage,
  target: postsQuery.fetchNextPage,
})
```

Dispatch the event in the model's scope. For a button that also prevents loading
while a request is active, see the [loading more guide](/effector-tanstack-query/guides/infinite-queries/#loading-more).

## Select

Flatten the loaded pages into a list:

```ts
select: data => data.pages.flatMap(page => page.items)
```

Place `select` directly in inline options, or in the object returned by the
factory. The resulting `$data` is `Store<Post[] | undefined>`; the cache retains
the original page set. See [composing select](/effector-tanstack-query/guides/queries/#composing-select)
for a complete factory composition example and inference guidance.

## Refetch and cancellation

For an active, enabled query, `refresh()` refetches retained pages in order.
Subsequent cursors are computed from fresh results using `getNextPageParam`.
With `maxPages`, only retained pages are refetched.

Forward `signal` to the request, as in the examples. Requests follow the shared
[cancellation rules](/effector-tanstack-query/api/create-query/#cancellation).
