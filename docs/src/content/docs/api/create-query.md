---
title: createQuery
description: Create a query bound to a QueryClient and exposed as effector stores.
---

Creates a query model with Effector stores for data and status, and events for
loading and refreshing. Define its options **inline** or pass an options
**factory** with a reactive `source`.

## Usage

### Inline

```ts
import { createStore } from 'effector'
import { createQuery } from '@effector-tanstack-query/core'

type Todo = { id: number; title: string }

declare function getTodo(
  params: { todoId: number },
  options?: { signal?: AbortSignal },
): Promise<Todo>

const $todoId = createStore(1)
const todoQuery = createQuery({
  name: 'todo',
  queryKey: ['todos', $todoId],
  queryFn: ({ queryKey: [, todoId], signal }) =>
    getTodo({ todoId }, { signal }),
  staleTime: 60_000,
})
```

Stores at the top level of `queryKey` resolve to values. The resolved key
identifies the cache entry.

### Factory

```ts
import { createStore } from 'effector'
import { createQuery } from '@effector-tanstack-query/core'
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

const $todoId = createStore(1)
const todoQuery = createQuery({
  name: 'todo',
  source: { todoId: $todoId },
  query: todoOptions,
})
```

The factory receives `{ todoId: number }` and recomputes options when the source
changes. TanStack uses the key, cache and options to decide whether to fetch.
[`queryOptions`](/effector-tanstack-query/api/query-options/) is optional:
existing React Query factories and functions returning plain options work directly.
See [reusing factories](/effector-tanstack-query/guides/queries/#reusing-query-options-factories)
for sharing a definition between consumers.

## Signature

Call `createQuery(options)` to use the scope's `$queryClient`, or
`createQuery(queryClient, options)` to bind the model to an explicit client.

| Parameter | Meaning |
| --- | --- |
| `TQueryFnData` | Data returned by `queryFn` |
| `TError` | Query error |
| `TData` | Selected model data; defaults to `TQueryFnData` |
| `TQueryKey` | Query key type |
| `TSource` | Factory source: a store or an object of stores |
| `TFactoryData` | Factory result before a consumer selector overrides it |

The factory receives `SourceValue<TSource>`, with stores replaced by their values.
For inline queries, `queryFn` receives `ResolvedQueryKey<TQueryKey>`.
Inline defaults `TError` to `Error`; factory uses TanStack's `DefaultError`,
including `Register.defaultError` when configured.

<details>
<summary>Inline overloads</summary>

```ts
declare function createQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  options: CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): QueryResult<TData, TError>

declare function createQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  const TQueryKey extends EffectorQueryKey = EffectorQueryKey,
>(
  queryClient: QueryClient,
  options: CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): QueryResult<TData, TError>
```

</details>

<details>
<summary>Factory overloads</summary>

The general signatures below accept an optional consumer selector. More specific
overloads infer the factory result when `select` is absent, and the consumer
result when it is a definite function. A function-or-`undefined` override keeps
the union of both results.

```ts
declare function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
  TFactoryData = TQueryFnData,
>(
  options: CreateQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TFactoryData
  >,
): QueryResult<TData | TFactoryData, TError>

declare function createQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  const TQueryKey extends QueryKey = QueryKey,
  const TSource extends OptionsSource = OptionsSource,
  TFactoryData = TQueryFnData,
>(
  queryClient: QueryClient,
  options: CreateQueryFactoryOptions<
    TSource,
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TFactoryData
  >,
): QueryResult<TData | TFactoryData, TError>
```

</details>

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

| Field | Type | Behavior |
| --- | --- | --- |
| `queryKey` | `TQueryKey extends EffectorQueryKey` | Required array; each top-level element can be a store or plain value |
| `queryFn` | Query function or supported TanStack skip token | Receives the resolved key, `signal` and the native query context; returns data or a promise. Can be supplied through QueryClient defaults |
| Other TanStack options | `QueryObserverOptions` fields | Set `select`, `staleTime`, `retry`, `placeholderData`, `meta`, etc. directly on the model definition |

Nested objects in a key are supported. To make their contents reactive, put a
`combine` store at the top level of the key; nested stores are not unwrapped.
See [reactive query keys](/effector-tanstack-query/guides/queries/#reactive-query-keys).

### Factory options

| Field | Type | Behavior |
| --- | --- | --- |
| `source` | `TSource extends OptionsSource` | Required store or shallow object of stores, including derived stores |
| `query` | `(source: SourceValue<TSource>) => options` | Required synchronous function receiving the resolved source and returning query options |

A single store is passed as its value: `source: $todoId` pairs with
`query: todoId => todoOptions({ todoId })`. A store shape becomes a plain object,
as in the usage example. Use `source: {}` for a factory without parameters.

The factory result contains `queryKey`, `queryFn` and reusable TanStack options.
Observer settings can also be overridden on the model. The callback can run
before mounting and while disabled; keep it pure and put network work in `queryFn`.

### Factory overrides

The following fields can be supplied beside `source` and `query`:

| Field | Type / purpose |
| --- | --- |
| `enabled`, `refetchInterval` | Same values and stores as the shared options above |
| `select` | `(data: TQueryFnData) => TData`; selects the model's data |
| `placeholderData` | Native value or callback using raw data, before `select` |
| `staleTime` | Native freshness setting |
| `refetchOnMount`, `refetchOnWindowFocus`, `refetchOnReconnect` | Native refetch policies |
| `refetchIntervalInBackground` | Whether polling continues in the background |
| `retryOnMount` | Native retry-on-mount setting |

A defined top-level value replaces the factory value. `false` and `0` are
valid overrides; omission or `undefined` inherits the factory value. Types follow
the installed Query Core version. Other settings, such as `retry`, `gcTime`,
`initialData` and `meta`, belong in the factory result.

A top-level `select` replaces the factory selector and receives raw query data;
the two selectors are not chained. Without an override, the factory's selected
result is preserved. If the override is a function or `undefined`, the model's
data type includes both possible results. Placeholder data also passes through
the effective selector; it does not replace the raw cache data.

Only `enabled` and `refetchInterval` accept stores at the top level. To derive
other options reactively, include their inputs in `source` and return their
values from `query`. A top-level override continues to take precedence after
source changes. See [consumer options](/effector-tanstack-query/guides/queries/#consumer-options).

### Option updates and notifications

| | Inline | Factory |
| --- | --- | --- |
| Reactive inputs | Top-level key stores, enabled and polling stores | Source and top-level override stores |
| Options on update | Updates key/enabled/polling; other resolved options are retained | Applies the full factory result; omitted fields use QueryClient defaults for the current key |
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

## QueryClient and activation

Creating a model does not subscribe its observer. `mounted` adds an owner;
`unmounted` releases one. The first mount subscribes, and the last matching
unmount unsubscribes. The model retains its last store values after unmount.
React query hooks manage mounting automatically.

Each scope has its own observer. Scopes using the same QueryClient share cache
entries and in-flight requests. An explicit client takes precedence over the
scope's client. Use a separate client and scope per SSR request.

Dispatch lifecycle events in the owning scope. See [connecting a consumer](/effector-tanstack-query/guides/queries/#lifecycle)
and [QueryClient setup](/effector-tanstack-query/guides/query-client/) for examples.

## Select

`select` transforms model data while the cache retains the query function's result:

```ts
select: todo => todo.title
// $data: Store<string | undefined>
```

Place it in inline options or the factory result. For a composed factory,
TypeScript may need an annotation on the outer callback parameter; see
[composing select](/effector-tanstack-query/guides/queries/#composing-select).

## Lifecycle events

Success carries selected data; failure carries the error. An event is emitted
when an observer notification reports the corresponding status and an advancing
`dataUpdatedAt` or `errorUpdatedAt` timestamp.

- The first observation on mount establishes a baseline without emitting events.
  Hydrated/initial cache data and placeholder data do not emit success on mount.
- `setQueryData` can emit success, including writes from another consumer of the
  same QueryClient.
- Notification filters and unchanged timestamps can suppress events. There is
  no guarantee of one event per request, including completions in the same millisecond.

Use these events with `sample`; see [reacting to query updates](/effector-tanstack-query/guides/queries/#reacting-to-query-updates).

## `prefetch` vs `mounted`

| Event | What it does | When `allSettled` completes |
| --- | --- | --- |
| `mounted` | Subscribes an observer, populates stores and may start a background fetch | After observer setup, without waiting for that fetch |
| `prefetch` | Fetches or reuses fresh data through QueryClient | After the fetch completes or fails |

Prefetch reads current scoped options and does nothing when `enabled` is false.
Without an observer it fills the cache, but does not populate model stores or
emit lifecycle events. A mounted model can observe the resulting cache update.

For SSR, [`prefetchQueries`](/effector-tanstack-query/api/prefetch-queries/) awaits
prefetch and then mounts the models so their stores can be serialized.

## Refetch

`refresh()` invalidates matching queries through `queryClient.invalidateQueries`.
Active, enabled queries refetch in the background. The same cache can also be
invalidated through QueryClient or [cache actions](/effector-tanstack-query/api/cache-actions/).

## Cancellation

Pass `queryFn`'s `signal` to your request, as in the usage examples. When the last
observer leaves a cache entry because of a key change or unmount, TanStack can
abort the consumed signal. If another observer still needs that entry, its
request remains active. To cancel explicitly, use
[`createCancel`](/effector-tanstack-query/api/cache-actions/).
