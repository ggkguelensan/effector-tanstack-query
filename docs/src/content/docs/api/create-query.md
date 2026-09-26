---
title: createQuery
description: Define a query inline or consume an options factory with reactive Effector parameters.
---

Creates a query model with Effector stores for data and status, and events for
loading and refreshing. Define its options **inline** or pass an options
**factory** with a reactive `source`. Both forms return `QueryResult`.

## Usage

The examples below load the same todo. They share this store and API function:

```ts
import { createStore } from 'effector'

type Todo = { id: number; title: string }
const $todoId = createStore(1)

async function fetchTodo(todoId: number, signal: AbortSignal): Promise<Todo> {
  const response = await fetch(`/api/todos/${todoId}`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
```

### Inline

Put the key and query function in the model. Stores at the top level of
`queryKey` resolve to values before the query function runs.

```ts
import { createQuery } from '@effector-tanstack-query/core'

const todoQuery = createQuery({
  name: 'todo',
  queryKey: ['todos', $todoId],
  queryFn: ({ queryKey: [, todoId], signal }) => fetchTodo(todoId, signal),
  staleTime: 60_000,
})
```

<a id="factory-form"></a>

### Factory

Keep reusable options in a function that accepts ordinary values. The adapter
calls it with the current values from `source`.

```ts
import { createQuery, queryOptions } from '@effector-tanstack-query/core'

const todoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: ['todos', todoId],
  queryFn: ({ signal }) => fetchTodo(todoId, signal),
  staleTime: 60_000,
})

const todoQuery = createQuery({
  name: 'todo',
  source: { todoId: $todoId },
  query: todoOptions,
})
```

When `$todoId` changes, the factory returns the options for that id, including a
new query function. TanStack uses the resulting key and cache state to decide
whether to fetch.

[`queryOptions`](/effector-tanstack-query/api/query-options/) is optional.
Existing React Query factories and functions returning plain options work
directly. See [reusing factories](/effector-tanstack-query/guides/queries/#reusing-query-options-factories)
for sharing a definition between consumers.

### QueryClient and activation

Both forms accept either `createQuery(options)` or
`createQuery(queryClient, options)`. Without an explicit client, the model reads
[`$queryClient`](/effector-tanstack-query/guides/query-client/) from its Effector
scope. An explicit client takes precedence over the scope's client.

Creating a model does not start its observer. Call `mounted` to subscribe and
`unmounted` to release that subscription. React hooks do this automatically.
For scoped applications, dispatch these events in the owning scope.

```ts
import { allSettled, fork } from 'effector'
import { QueryClient } from '@tanstack/query-core'
import { $queryClient } from '@effector-tanstack-query/core'

const queryClient = new QueryClient()
queryClient.mount()
const scope = fork({ values: [[$queryClient, queryClient]] })

await allSettled(todoQuery.mounted, { scope })
// Read with scope.getState(todoQuery.$data), or useUnit in the UI.
await allSettled(todoQuery.unmounted, { scope })
```

Each scope has its own observer. Multiple mounts share it; the last matching
unmount releases it. Scopes using the same QueryClient share its cache. Use a
separate client and scope for each SSR request.

## Options

### Shared options

| Field | Accepted values | Behavior |
| --- | --- | --- |
| `name` | `string` | Gives model stores stable SIDs for SSR; use a unique name per model |
| `enabled` | `boolean` or `Store<boolean>` | Controls automatic fetching; defaults to `true` when neither the model nor factory supplies it |
| `refetchInterval` | Number of milliseconds, `false`, a TanStack interval callback, or `Store<number \| false \| undefined>` | Sets polling; `false` stops it |

Use `combine` for a condition derived from other stores. The adapter supports
boolean `enabled`, not a native `(query) => boolean` callback. If a factory
returns that callback, supply a boolean override at the consumer.

### Inline options

`CreateQueryOptions` accepts TanStack `QueryObserverOptions`, with reactive
`queryKey`, `enabled` and `refetchInterval`:

| Field | Behavior |
| --- | --- |
| `queryKey` | Required array; each top-level element can be a store or plain value |
| `queryFn` | Receives the resolved key, `signal` and the native query context; returns data or a promise. Can be supplied through QueryClient defaults |
| Other TanStack options | Set `select`, `staleTime`, `retry`, `placeholderData`, `meta`, etc. directly on the model definition |

Nested objects in a key are supported. To make their contents reactive, put a
`combine` store at the top level of the key; nested stores are not unwrapped.
See [reactive query keys](/effector-tanstack-query/guides/queries/#reactive-query-keys).

### Factory options

| Field | Behavior |
| --- | --- |
| `source` | Required store or shallow object of stores, including derived stores |
| `query` | Required synchronous function receiving the resolved source and returning query options |

A single store is passed as its value: `source: $todoId` pairs with
`query: todoId => todoOptions({ todoId })`. A store shape becomes a plain object,
as in the usage example. Use `source: {}` for a factory without parameters.

Place `queryKey`, `queryFn`, `select`, `staleTime` and other TanStack options in
the factory result. The callback can run before mounting and while disabled;
keep it pure and put network work in `queryFn`.

### Factory overrides

A defined top-level `enabled` or `refetchInterval` replaces the factory's value.
`false` is an override; `undefined` uses the factory value. The same rule applies
when an override store changes.

```ts
import { combine, createStore } from 'effector'

const $routeActive = createStore(false)
const $enabled = combine($todoId, $routeActive, (id, active) => id > 0 && active)
const $pollingInterval = createStore<number | false>(false)

const activeTodoQuery = createQuery({
  name: 'active-todo',
  source: { todoId: $todoId },
  query: todoOptions,
  enabled: $enabled,
  refetchInterval: $pollingInterval,
})
```

To derive options together, include their inputs in `source` and return the
values from `query`. See [consumer options](/effector-tanstack-query/guides/queries/#consumer-options).

<a id="observer-options-policy"></a>

### Option updates and notifications

| | Inline | Factory |
| --- | --- | --- |
| Reactive inputs | Top-level key stores, enabled and polling stores | Source and top-level override stores |
| Options on update | Patches key/enabled/polling on the observer's resolved options; other resolved values are retained | Applies the full factory result; omitted fields use QueryClient defaults for the current key |
| `notifyOnChangeProps` | Uses the supplied option or client default | Uses `'all'`, including when the factory or client requests a narrower filter |

A factory change to `select` alone updates the selected data without forcing a
fetch. Other updates follow TanStack's fetch policies.

Notification filters in inline queries can suppress store and event updates.
Factory models receive all observer notifications; UI consumers can subscribe
to individual Effector stores. Input options and client defaults are not mutated.

Options such as `throwOnError` belong to the UI consumer. They do not change
activation or rendering behavior of the core model.

## Return value (`QueryResult<TData, TError>`)

| Field                | Type                                          | Description                              |
| -------------------- | --------------------------------------------- | ---------------------------------------- |
| `$data`              | `Store<TData \| undefined>`                   | The selected data (post-`select`)        |
| `$error`             | `Store<TError \| null>`                       | Last error                               |
| `$status`            | `Store<'pending' \| 'success' \| 'error'>`    | Query status                             |
| `$isPending`         | `Store<boolean>`                              | No data yet                              |
| `$isFetching`        | `Store<boolean>`                              | Request in flight                        |
| `$isSuccess`         | `Store<boolean>`                              | Has successful data                      |
| `$isError`           | `Store<boolean>`                              | Failed                                   |
| `$isPlaceholderData` | `Store<boolean>`                              | Showing placeholder                      |
| `$fetchStatus`       | `Store<'fetching' \| 'paused' \| 'idle'>`     | Underlying fetch status                  |
| `mounted`            | `EventCallable<void>`                         | Bump reference count; the first mount subscribes the observer |
| `unmounted`          | `EventCallable<void>`                         | Release one owner; the last unmount unsubscribes |
| `refresh`            | `EventCallable<void>`                         | Invalidate the key and refetch active queries                     |
| `prefetch`           | `EventCallable<void>`                         | `queryClient.fetchQuery` + **awaits**; for SSR / route loaders |
| `$observer`          | `Store<QueryObserver<TData, TError> \| null>` | Per-scope observer (created on `mounted()`) |
| `$queryClient`       | `Store<QueryClient \| null>`                  | Resolved client for this query           |
| `finished`           | `{ success: Event<TData>; failure: Event<TError> }` | Lifecycle events for `sample`-driven reactions |

`$data` contains the `select` result, or the query function's data when there is
no selector. It includes `undefined` before the observer populates the model,
even when options specify `initialData`. The QueryClient cache holds the raw data.

## Lifecycle events

Use `finished.success` and `finished.failure` as clocks for `sample`:

```ts
sample({
  clock: todoQuery.finished.success,
  fn: todo => todo.id,
  target: loadComments,
})
```

Success carries selected data; failure carries the error. An event is emitted
when an observer notification reports the corresponding status and an advancing
`dataUpdatedAt` or `errorUpdatedAt` timestamp.

- The first observation on mount establishes a baseline without emitting events.
  Hydrated/initial cache data and placeholder data do not emit success on mount.
- `setQueryData` can emit success, including writes from another consumer of the
  same QueryClient.
- Notification filters and unchanged timestamps can suppress events. There is
  no guarantee of one event per request, including completions in the same millisecond.

## `prefetch` vs `mounted`

| Event | What it does | When `allSettled` completes |
| --- | --- | --- |
| `mounted` | Subscribes an observer, populates stores and may start a background fetch | After observer setup, without waiting for that fetch |
| `prefetch` | Fetches or reuses fresh data through QueryClient | After the fetch completes or fails |

Prefetch reads current scoped options and does nothing when `enabled` is false.
Without an observer it fills the cache, but does not populate model stores or
emit lifecycle events. A mounted model can observe the resulting cache update.

For SSR, [`prefetchQueries`](/effector-tanstack-query/api/prefetch-queries/) awaits
prefetch and then mounts the models so their stores can be serialized:

```ts
import { prefetchQueries } from '@effector-tanstack-query/core'

await prefetchQueries([todoQuery], { scope })
```

## Cancellation

Pass `queryFn`'s `signal` to your request, as in the usage examples. When the last
observer leaves a cache entry because of a key change or unmount, TanStack can
abort the consumed signal. If another observer still needs that entry, its
request remains active. To cancel explicitly, use
[`createCancel`](/effector-tanstack-query/api/cache-actions/).

## Generic inference

Both forms infer data from the query function and selected data from `select`.
Prefer a typed API function so these types flow through the definition:

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

The outer parameter annotation helps TypeScript infer a selector composed with
spread inside another callback. A ready-made factory needs no extra wrapper.
See [composing select](/effector-tanstack-query/guides/queries/#composing-select)
for alternatives.

Inline accepts explicit generics in the order
`<TQueryFnData, TError, TData, TQueryKey>`. Its error type defaults to `Error`.
Factory calls infer errors from the returned options and otherwise use TanStack's
`DefaultError`, including an application's registered default error.
