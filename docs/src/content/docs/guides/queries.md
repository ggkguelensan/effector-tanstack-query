---
title: Queries
description: Reactive query keys, enabled, select, placeholderData, polling, and dependent queries.
---

A query is created with `createQuery(options)` (the registered default `QueryClient` is used) or `createQuery(queryClient, options)` (explicit client). It returns an object of effector stores and events.

## Reactive query keys

Each top-level element of the inline `queryKey` array can be a store or a plain
value. Store updates update the resolved key; TanStack decides whether fetching
is needed.

```ts
const $userId = createStore(1)

const userQuery = createQuery({
  name: 'user',
  queryKey: ['user', $userId],
  queryFn: ({ queryKey }) => fetchUser(queryKey[1] as number),
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
  queryFn: ({ queryKey: [, params], signal }) => fetchTodo(params, { signal }),
  enabled: $enabled,
})
```

The resolved key contains ordinary values, for example
`['todos', { todoId: 1, filters: { language: 'en' } }]`.
`['todos', { todoId: $todoId }]` does **not** unwrap the nested store.
This inline behavior is unchanged by factory support.

## Enabled flag

`enabled` controls whether the query runs. It accepts a boolean OR a `Store<boolean>`:

```ts
// Static
const userQuery = createQuery({
  name: 'user',
  queryKey: ['user'],
  queryFn: fetchUser,
  enabled: false, // never fetches until enabled changes
})

// Reactive
const $isLoggedIn = createStore(false)

const profileQuery = createQuery({
  name: 'profile',
  queryKey: ['profile'],
  queryFn: fetchProfile,
  enabled: $isLoggedIn, // fetches once $isLoggedIn becomes true
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

`refetchInterval` also accepts a `Store<number | false>`. Toggling the store starts / stops polling at runtime — the library calls `observer.setOptions({ refetchInterval })` on every store change, so the live observer picks up the new interval immediately.

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
userQuery.unmounted() // last owner: cancels in-flight, releases observer
```

In React, the [`useQuery`](/effector-tanstack-query/react/use-query/) hook calls these for you.


## Reusing query options factories

A definition accepts ordinary values and keeps its key, function and shared
policies together. Optional `.qk` / `.qo` filenames are application conventions.

```ts
const todoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: ['todos', 'detail', { todoId }],
  queryFn: ({ signal }) => fetchTodo(todoId, { signal }),
  staleTime: 60_000,
})

// Imperative consumer / server loader:
await queryClient.fetchQuery(todoOptions({ todoId: 1 }))

// Native React consumer:
useQuery({ ...todoOptions({ todoId }), enabled: isEnabled })

// Effector consumer:
const $enabled = combine($todoId, $routeActive, (id, active) => id > 0 && active)
const todoQuery = createQuery({
  name: 'todo.detail',
  source: { todoId: $todoId },
  query: todoOptions,
  enabled: $enabled,
})
```

This supports introducing Effector into an existing TanStack app and introducing
portable definitions into an Effector app. All consumers must use the same
QueryClient to share the cache. Create a separate client and Effector scope per
SSR request; pass that client through `$queryClient` in the scope. Prefetch reads
current scoped options; use `prefetchQueries` when both serialized Effector state
and Query cache data are needed.

The model does not require the adapter's React `useQuery`. With a UI lifetime
owner, bind `mounted` and `unmounted` to its start/stop events through `sample`,
and read `$data`, `$isFetching` and `$error` using the UI's Effector bindings.
Always dispatch into the owning scope. Native option callbacks are ordinary JS
callbacks; use scope binding when they dispatch Effector units.

### Composing select

Passing a ready-made factory requires no extra wrapper. Composing a new callback
inside another callback can limit TypeScript's contextual inference. A checked
workaround is annotating the outer parameter:

```ts
const titleQuery = createQuery({
  source: $todoId,
  query: (todoId: number) => ({
    ...todoOptions({ todoId }),
    select: todo => todo.title,
  }),
})
```

Alternatively, use a typed selector, or a helper at the composition site:

```ts
query: todoId => queryOptions({
  ...todoOptions({ todoId }),
  select: todo => todo.title,
})
```

These are inference workarounds, not a requirement to wrap every factory.
`select` changes this consumer's data; cache access through the key remains typed
as the raw query data. Top-level `select` in the factory form is not supported.

### Disabled and nullable parameters

`enabled: false` prevents automatic execution; it does not prevent factory
resolution or make a nullable source non-null. Include changing dependencies in
`source` and handle missing parameters in the definition (for example with
`skipToken`). A skipped query has no runnable function; `refresh` does not turn it
into a fetch. Here `refresh` invalidates active queries, while `prefetch` respects
the adapter's boolean `enabled` gate.

Rule of thumb: use **inline** when defining a key in place, **factory** when
reusing an options definition, and **createQueries** for one query per source
item.
