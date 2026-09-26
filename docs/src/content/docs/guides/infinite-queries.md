---
title: Infinite queries
description: Load more pages, handle pagination states, and build bidirectional lists with Effector.
---

Build a list that loads another page on demand. Start with a configured
[QueryClient](/effector-tanstack-query/guides/query-client/). The examples below
use a reusable options factory; an [inline definition](/effector-tanstack-query/api/create-infinite-query/#inline)
can drive the same list.

## Define the pages

Assume `./api` exports this application API function. The HTTP implementation is
omitted; `signal` belongs to the request options:

```ts
// api.ts — application API contract
export type Post = { id: number; title: string }
export type PostsPage = { items: Post[]; nextCursor: number | null }

export declare function getPosts(
  params: { category: string; cursor: number },
  options?: { signal?: AbortSignal },
): Promise<PostsPage>
```

Keep the key, page loader and cursor policy together:

```ts
// queries.ts
import { infiniteQueryOptions } from '@effector-tanstack-query/core'
// or: import { infiniteQueryOptions } from '@tanstack/react-query'
import { getPosts } from './api'

export const postsOptions = ({ category }: { category: string }) =>
  infiniteQueryOptions({
    queryKey: ['posts', category],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      getPosts({ category, cursor: pageParam }, { signal }),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    staleTime: 60_000,
  })
```

The first request uses cursor `0`. After each page, `getNextPageParam` determines
the next cursor. Returning `undefined` or `null` means the list has ended.

## Loading more

Create the model and connect view events to it:

```ts
// model.ts
import { combine, createEvent, createStore, sample } from 'effector'
import { createInfiniteQuery } from '@effector-tanstack-query/core'
import { postsOptions } from './queries'

export const categoryChanged = createEvent<string>()
const $category = createStore('books').on(categoryChanged, (_, value) => value)

export const postsQuery = createInfiniteQuery({
  name: 'posts',
  source: { category: $category },
  query: postsOptions,
})

export const viewOpened = createEvent()
export const viewClosed = createEvent()
export const loadMoreClicked = createEvent()

export const $canLoadMore = combine(
  postsQuery.$hasNextPage,
  postsQuery.$isFetching,
  (hasNextPage, isFetching) => hasNextPage && !isFetching,
)

sample({ clock: viewOpened, target: postsQuery.mounted })
sample({ clock: viewClosed, target: postsQuery.unmounted })
sample({
  clock: loadMoreClicked,
  filter: $canLoadMore,
  target: postsQuery.fetchNextPage,
})
```

Open the view to activate observation. Loading the next page is a separate user
action, allowed only when there is another page and no request is active. This
also avoids starting pagination during a background refetch.

Mounting does not wait for the initial page. Read stores to display its progress;
for awaited server loading use
[`prefetchQueries`](/effector-tanstack-query/api/prefetch-queries/).

### Connect the view

Dispatch view and click events in the consumer's scope. Here is a React consumer
using `useUnit`; the data model itself does not depend on React:

```tsx
// PostList.tsx
import { useEffect } from 'react'
import { useUnit } from 'effector-react'
import {
  postsQuery, $canLoadMore, viewOpened, viewClosed, loadMoreClicked,
} from './model'

function PostList() {
  const {
    data, error, isPending, isFetchingNextPage, isFetchNextPageError,
    hasNextPage, canLoadMore, open, close, loadMore,
  } = useUnit({
    data: postsQuery.$data,
    error: postsQuery.$error,
    isPending: postsQuery.$isPending,
    isFetchingNextPage: postsQuery.$isFetchingNextPage,
    isFetchNextPageError: postsQuery.$isFetchNextPageError,
    hasNextPage: postsQuery.$hasNextPage,
    canLoadMore: $canLoadMore,
    open: viewOpened,
    close: viewClosed,
    loadMore: loadMoreClicked,
  })

  useEffect(() => {
    open()
    return () => close()
  }, [open, close])

  if (!data) {
    return <p>{isPending ? 'Loading…' : error?.message ?? 'No data'}</p>
  }

  const posts = data.pages.flatMap(page => page.items)
  return (
    <>
      <ul>{posts.map(post => <li key={post.id}>{post.title}</li>)}</ul>
      {error && <p role="alert">{error.message}</p>}
      {hasNextPage ? (
        <button disabled={!canLoadMore} onClick={loadMore}>
          {isFetchingNextPage ? 'Loading…' : isFetchNextPageError ? 'Retry' : 'Load more'}
        </button>
      ) : <p>All posts loaded</p>}
    </>
  )
}
```

The list keeps already loaded pages when the next-page request fails. Once the
request settles, the same button can retry. When there is no next cursor, the
button is replaced with an end-of-list message.

You can also use [useInfiniteQuery](/effector-tanstack-query/react/use-infinite-query/)
or [useSuspenseInfiniteQuery](/effector-tanstack-query/react/use-suspense-infinite-query/),
which manage mounting automatically. Choose one lifecycle owner for this view.

## Change the category

The model above includes category in the key. Dispatch `categoryChanged` from a
scope-bound UI event to switch lists. Pages belonging to different categories
occupy separate cache entries; returning to a category can reuse its cached pages.
The cache and freshness settings determine whether a request is needed.

Keep every parameter that changes the fetched list in its key. Changing only a
query function at the same key does not create a separate page set.

## Select a flat list

To expose a flat array from the model, replace its `source` and `query` fields
with this composition using the existing `$category` and `postsOptions`:

```ts
const postsQuery = createInfiniteQuery({
  name: 'posts',
  source: $category,
  query: (category: string) => ({
    ...postsOptions({ category }),
    select: data => data.pages.flatMap(page => page.items),
  }),
})
// postsQuery.$data: Store<Post[] | undefined>
```

The view can now render `data` directly instead of flattening `data.pages`.
Pagination events still operate on the original cached page set. For inline
options, put the selector beside `queryFn`.
See the [select contract](/effector-tanstack-query/api/create-infinite-query/#select).

## Limit retained pages — maxPages

For a long feed, add `maxPages` to the query options:

```ts
// In postsOptions, or directly in an inline definition:
maxPages: 10
```

At the limit, loading forward removes a page from the start; loading backward
removes one from the end. Those items also disappear from the displayed list.
If the UI must navigate back to discarded pages, provide the cursor callbacks
for that direction. Omitting `maxPages` (or setting it to `0`) keeps all pages.

## Refresh the list

Add a refresh action to `model.ts`:

```ts
export const refreshClicked = createEvent()
sample({ clock: refreshClicked, target: postsQuery.refresh })
```

For active, enabled queries, invalidation refetches retained pages in order.
Subsequent cursors come from fresh page results. With `maxPages`, only the
retained set is refetched. The `$canLoadMore` guard blocks pagination during this
request. See [refetch and cancellation](/effector-tanstack-query/api/create-infinite-query/#refetch-and-cancellation).

## Bidirectional pagination

For a conversation, define both cursor directions. This is a separate model;
assume `./api` also exports `getMessages` with the contract below:

```ts
import { createInfiniteQuery } from '@effector-tanstack-query/core'

type Message = { id: string; text: string }
type MessagesPage = {
  items: Message[]
  olderCursor: string | null
  newerCursor: string | null
}
declare function getMessages(
  params: { cursor: string },
  options?: { signal?: AbortSignal },
): Promise<MessagesPage>

const chatQuery = createInfiniteQuery({
  name: 'messages',
  queryKey: ['messages'],
  initialPageParam: 'latest',
  queryFn: ({ pageParam, signal }) => getMessages({ cursor: pageParam }, { signal }),
  getNextPageParam: lastPage => lastPage.olderCursor ?? undefined,
  getPreviousPageParam: firstPage => firstPage.newerCursor ?? undefined,
})
```

Apply the loading-more recipe to each direction: guard `fetchNextPage` with
`$hasNextPage`, and `fetchPreviousPage` with `$hasPreviousPage`; also check
`$isFetching`. Mount the chat model before dispatching either event. In this API,
"next" means older messages because that is how the cursor callbacks are defined.

For exact option and result types, see
[createInfiniteQuery](/effector-tanstack-query/api/create-infinite-query/).
