---
title: queryOptions / infiniteQueryOptions
description: Define reusable query options with inferred data types and typed cache keys.
---

Optional helpers for defining options shared by QueryClient, native React Query
hooks and Effector models. They return the same object you pass in; their purpose
is type inference and typed cache access. They depend only on TanStack Query Core.

`createQuery` and `createInfiniteQuery` also accept plain options factories and
factories built with React Query's helpers. You do not need to replace an
existing helper import or wrap its result again.

## queryOptions

Define a typed query function and let the helper infer the options:

```ts
import { QueryClient } from '@tanstack/query-core'
import { queryOptions } from '@effector-tanstack-query/core'

type Todo = { id: number; title: string }

async function fetchTodo(todoId: number, signal: AbortSignal): Promise<Todo> {
  const response = await fetch(`/api/todos/${todoId}`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const todoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: ['todos', { todoId }],
  queryFn: ({ signal }) => fetchTodo(todoId, signal),
  staleTime: 60_000,
})

const queryClient = new QueryClient()
await queryClient.fetchQuery(todoOptions({ todoId: 1 }))
```

Use the same factory in an Effector model:

```ts
import { createStore } from 'effector'
import { createQuery } from '@effector-tanstack-query/core'

const $todoId = createStore(1)
const todoQuery = createQuery(queryClient, {
  name: 'todo',
  source: { todoId: $todoId },
  query: todoOptions,
})
// todoQuery.$data: Store<Todo | undefined>
```

The factory defines options; the consumer supplies the QueryClient and controls
execution. See [model activation](/effector-tanstack-query/api/create-query/#queryclient-and-activation)
and [sharing factories](/effector-tanstack-query/guides/queries/#reusing-query-options-factories).

## Typed cache access

The returned key carries the query function's data type through TanStack's
`DataTag`. QueryClient uses it to infer reads and writes:

```ts
const key = todoOptions({ todoId: 1 }).queryKey

queryClient.getQueryData(key)
// Todo | undefined

queryClient.setQueryData(key, previous =>
  previous ? { ...previous, title: 'Updated' } : previous,
)
// previous: Todo | undefined
```

The key describes **raw cache data**, even if `select` transforms a consumer's
result. A selector returning `todo.title` gives that consumer a string; the
cache still holds `Todo`.

## infiniteQueryOptions

Define the page function and cursor callbacks together:

```ts
import { infiniteQueryOptions } from '@effector-tanstack-query/core'

type Post = { id: number; title: string }
type PostsPage = { items: Post[]; nextCursor: number | null }

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

const postsOptions = ({ category }: { category: string }) => infiniteQueryOptions({
  queryKey: ['posts', category],
  initialPageParam: 0,
  queryFn: ({ pageParam, signal }) => fetchPosts({ category, cursor: pageParam, signal }),
  getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
})

await queryClient.fetchInfiniteQuery(postsOptions({ category: 'books' }))
```

`pageParam` is inferred from the page options. The tagged cache key describes an
`InfiniteData` page set. Some helper overloads type its `pageParams` as
`unknown[]`; that does not make the query function's `pageParam` unknown.
See [`createInfiniteQuery`](/effector-tanstack-query/api/create-infinite-query/)
for consuming this factory from Effector.

## Types and consumer behavior

- Helpers support defined/undefined `initialData` and the skip-token overloads.
- Registered query keys, metadata and default errors from TanStack's `Register`
  interface are respected where supported by the installed Query Core version.
- Effector `$data` includes `undefined` before observer activation, even with
  `initialData`. Helper overloads do not change the model's lifecycle.
- Effector accepts boolean `enabled`. Native helper return types are accepted,
  but an actual callback value needs a boolean override at the Effector consumer.
  Use `combine` for reactive conditions.
- Factories exchange ordinary values. Vue helper/ref integration is not supported;
  compatibility with other framework helpers has not been verified.

The supported Query Core range is `^5.0.0`. Error tags and `skipToken` require a
version that provides those features. Keep native TanStack packages on matching
versions when sharing definitions.

The helper declarations are adapted from TanStack React Query 5.100.10. The
upstream MIT license is included in the core package as `LICENSE.TanStack`.
