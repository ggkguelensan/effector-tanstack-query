---
title: Queries
description: Reactive query keys, enabled, select, placeholderData, polling, and dependent queries.
---

`createQuery` connects TanStack Query to Effector stores and events. Choose how
to define its options:

| Form | Use it when | Reactive inputs |
| --- | --- | --- |
| Inline | The query is defined in the Effector model | Stores in `queryKey`, `enabled` and `refetchInterval` |
| Factory | An options function is shared with other consumers | `source`, plus optional enabled/polling overrides |

Both forms have the same stores, events and lifecycle. For a complete example of
each, see [`createQuery`](/effector-tanstack-query/api/create-query/#usage).
Use [`createQueries`](/effector-tanstack-query/api/create-queries/) when you need
one query per element of a source array.

## Reactive query keys

Each top-level element of the inline `queryKey` array can be a store or a plain
value. Store updates update the resolved key; TanStack decides whether fetching
is needed.

```ts
const $userId = createStore(1)

const userQuery = createQuery({
  name: 'user',
  queryKey: ['user', $userId],
  queryFn: ({ queryKey }) => fetchUser(queryKey[1]),
})
```

Mixing stores and primitives is supported:

```ts
queryKey: ['posts', 42, $section, { sort: 'asc' }]
```

Keys can contain nested objects. For reactive objects, put a `combine` store
at the top level of the key:

```ts
const $params = combine({
  todoId: $todoId,
  filters: combine({ language: $language }),
})

const todoQuery = createQuery({
  name: 'todo',
  queryKey: ['todos', $params],
  queryFn: ({ queryKey: [, params], signal }) => fetchLocalizedTodo(params, signal),
  enabled: $enabled,
})
```

The resolved key contains ordinary values, for example
`['todos', { todoId: 1, filters: { language: 'en' } }]`.
`['todos', { todoId: $todoId }]` does **not** unwrap the nested store.

## Reusing query options factories

Keep shared keys, query functions and cache policies in a function that accepts
ordinary parameters. This example uses an existing React Query helper:

```ts
// queries.ts
import { queryOptions } from '@tanstack/react-query'
import { fetchTodo } from './api'

export const todoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: ['todos', { todoId }],
  queryFn: ({ signal }) => fetchTodo(todoId, signal),
  staleTime: 60_000,
})
```

Consumers call the same function:

```ts
// QueryClient, for example in a server loader
await queryClient.fetchQuery(todoOptions({ todoId: 1 }))

// Native React Query
useQuery(todoOptions({ todoId }))

// Effector
const todoQuery = createQuery({
  name: 'todo',
  source: { todoId: $todoId },
  query: todoOptions,
})
```

The factory receives `{ todoId: number }`. A source change recomputes all options
together; TanStack decides whether fetching is needed. Include
parameters that distinguish cached data in the key.

No helper conversion is needed. For an app without React Query, use the optional
[`queryOptions` / `infiniteQueryOptions` helpers from core](/effector-tanstack-query/api/query-options/),
or return a plain options object.

### Consumer options

Add consumer-specific options by composing the factory result. Include the
values they depend on in `source`:

```ts
const todoQuery = createQuery({
  name: 'todo',
  source: {
    todoId: $todoId,
    isEnabled: $isEnabled,
    pollingInterval: $pollingInterval,
  },
  query: ({ todoId, isEnabled, pollingInterval }) => ({
    ...todoOptions({ todoId }),
    enabled: isEnabled,
    refetchInterval: pollingInterval,
  }),
})
```

For enabled and polling, you can also pass stores directly to the adapter:

```ts
const todoQuery = createQuery({
  name: 'todo',
  source: { todoId: $todoId },
  query: todoOptions,
  enabled: $isEnabled,
  refetchInterval: $pollingInterval,
})
```

A defined top-level value replaces the factory value. `false` overrides;
`undefined` inherits. `select` and other query options belong in the factory
result. Derive boolean conditions with `combine`; the adapter does not evaluate
native `enabled` callbacks.

### Composing select

A ready-made factory retains its types when passed directly. For a selector
composed inside `query`, annotate the outer parameter if TypeScript cannot infer
the nested callback's input:

```ts
const titleQuery = createQuery({
  name: 'todo-title',
  source: $todoId,
  query: (todoId: number) => ({
    ...todoOptions({ todoId }),
    select: todo => todo.title,
  }),
})
// titleQuery.$data: Store<string | undefined>
```

Alternatively, define a typed selector separately or wrap the composed options
with `queryOptions`. The wrapper is optional for ready-made factories.
`select` changes the model's data; the cache still contains the original todo.
Changing only the selector at the same key does not force a fetch.

### Disabled and nullable parameters

`enabled: false` controls fetching, not factory evaluation. The factory still
receives current source values, including `null` or `undefined`. Handle those
values when defining `queryFn`; do not rely on enabled to narrow their type.
With a TanStack version that provides `skipToken`, for example:

```ts
import { skipToken } from '@tanstack/query-core'

const nullableTodoOptions = (todoId: number | null) => queryOptions({
  queryKey: ['todos', { todoId }],
  queryFn: todoId === null ? skipToken : ({ signal }) => fetchTodo(todoId, signal),
})
```

A factory result with `skipToken` has no runnable function. `refresh` does not
turn it into a fetch; update the source to provide a query function.

### Shared cache and scopes

Use the same QueryClient to share cache entries between Effector and native
consumers. For SSR, give each request its own client and scope. Use
[`prefetchQueries`](/effector-tanstack-query/api/prefetch-queries/) when you need
both cached data and populated Effector stores for serialization.

The model can also be driven through `sample` and `useUnit`; consuming a factory
does not require the adapter's React hooks. Pair `mounted` and `unmounted` with
the consumer's lifetime, and dispatch into its Effector scope.

## Enabled flag

`enabled` controls automatic fetching. It accepts a boolean or a
`Store<boolean>`:

```ts
// Static
const userQuery = createQuery({
  name: 'user',
  queryKey: ['user'],
  queryFn: fetchUser,
  enabled: false, // no automatic fetch
})

// Reactive
const $isLoggedIn = createStore(false)

const profileQuery = createQuery({
  name: 'profile',
  queryKey: ['profile'],
  queryFn: fetchProfile,
  enabled: $isLoggedIn, // allows fetching while logged in
})
```

## Dependent queries

Use one query's `$isSuccess` as another's `enabled`:

```ts
const userQuery = createQuery({
  name: 'user',
  queryKey: ['user'],
  queryFn: fetchUser,
})

const postsQuery = createQuery({
  name: 'user-posts',
  queryKey: ['posts'],
  queryFn: fetchPosts,
  enabled: userQuery.$isSuccess,
})
```

## select — narrow data shape

`select` runs after the queryFn and narrows the displayed `TData` type:

```ts
const userQuery = createQuery({
  name: 'user',
  queryKey: ['user'],
  queryFn: () => fetchUser(), // returns { id, name, email, role }
  select: (data) => data.name, // $data: Store<string | undefined>
})
```

If `select` throws, the query transitions to `error` state with the thrown value.

## placeholderData

Show data while the new key is loading:

```ts
import { keepPreviousData } from '@tanstack/query-core'

const todosQuery = createQuery({
  name: 'todos',
  queryKey: ['todos', $page],
  queryFn: ({ queryKey }) => fetchTodos(queryKey[1]),
  placeholderData: keepPreviousData,
})

todosQuery.$isPlaceholderData // Store<boolean>
```

A static value or function is also supported:

```ts
placeholderData: { id: 0, name: 'Loading…' }

// Or a function that gets prevData and prevQuery
placeholderData: (prev) => prev,
```

## Polling with refetchInterval

```ts
const statusQuery = createQuery({
  name: 'status',
  queryKey: ['status'],
  queryFn: fetchStatus,
  refetchInterval: 5000, // every 5 s
})
```

A function form lets you stop polling based on data:

```ts
refetchInterval: (q) => {
  const v = q.state.data as { done: boolean } | undefined
  return v?.done ? false : 1000
},
```

### Reactive `refetchInterval`

`refetchInterval` also accepts a `Store<number | false | undefined>`. Updating
the store changes polling for the mounted query. In the factory form,
`undefined` uses the interval returned by the factory.

```ts
import { createEvent, createStore } from 'effector'

const togglePolling = createEvent()
const $interval = createStore<number | false>(3000).on(
  togglePolling,
  (v) => (v === false ? 3000 : false),
)

const statusQuery = createQuery({
  queryKey: ['status'],
  queryFn: fetchStatus,
  refetchInterval: $interval,   // ← reactive
})

// Anywhere in your app:
togglePolling()  // → stops / resumes polling
```

This works under `fork({ values })` too — each scope drives its own observer through the same store.

## refetchOnMount / refetchOnWindowFocus / refetchOnReconnect

All three accept `boolean | 'always' | (query) => boolean | 'always'` and behave exactly as in TanStack Query. Defaults: `true` for mount/focus/reconnect.

```ts
createQuery({
  name: 'auth',
  queryKey: ['auth'],
  queryFn: fetchAuth,
  refetchOnWindowFocus: 'always', // refetch even on fresh data
  refetchOnReconnect: false,      // never refetch on reconnect
})
```

## Manual refresh

```ts
userQuery.refresh() // invalidates the query and refetches in the background
```

## Reacting to fetch completion

`finished.success` / `finished.failure` are events you can drive `sample` from —
react to observed cache updates without watching `$status` by hand.

```ts
const userQuery = createQuery({
  name: 'user',
  queryKey: ['user', $userId],
  queryFn: ({ queryKey }) => fetchUser(queryKey[1]),
})

// Chain a dependent load off an observed success.
sample({
  clock: userQuery.finished.success,
  target: loadSettings,
})

// Surface an observed failure.
sample({
  clock: userQuery.finished.failure,
  fn: (err) => `Failed: ${err.message}`,
  target: showToast,
})
```

`finished.success` carries the post-`select` data; `finished.failure` carries the
error. They can fire after fetches, `refresh()`, or `setQueryData`, when the
observer reports an advancing result timestamp. They do **not** fire for the
baseline state seen on mount (e.g. SSR-hydrated cache), and do not guarantee one
event per request: notification filters and unchanged timestamps can suppress
events. See the
[`createQuery` lifecycle events reference](/effector-tanstack-query/api/create-query/#lifecycle-events)
for the full semantics.

## Lifecycle

You must call `mounted()` (or use `useQuery(query)` in React) for the observer to subscribe. The last matching `unmounted()` tears it down.

The observer is shared per Scope and reference-counted: every `mounted()` is one owner, and only the last matching `unmounted()` releases the observer. Several components and a feature-level `sample` can drive the same query independently — unmounting one of them doesn't stop updates for the rest. Extra `unmounted()` calls are a safe no-op.

Forks have separate observers and Effector state. Cache isolation depends on the
QueryClient: give each server request its own client. Forks sharing one client
also share its cache and in-flight request deduplication. After the last unmount,
the model retains its last store values but stops observing cache updates.

```ts
userQuery.mounted()
// ...
userQuery.unmounted() // last owner releases this model's observer
```

In React, the [`useQuery`](/effector-tanstack-query/react/use-query/) hook calls these for you.
