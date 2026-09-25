---
title: createQuery
description: Create a query bound to a QueryClient and exposed as effector stores.
---

```ts
import { createQuery } from '@effector-tanstack-query/core'

// Uses the default $queryClient (set via setQueryClient / fork values).
function createQuery<TQueryFnData, TError = Error, TData = TQueryFnData>(
  options: CreateQueryOptions<TQueryFnData, TError, TData>,
): QueryResult<TData, TError>

// Explicit client — locks the factory to this client; fork({ values })
// overrides of $queryClient do not apply.
function createQuery<TQueryFnData, TError = Error, TData = TQueryFnData>(
  queryClient: QueryClient,
  options: CreateQueryOptions<TQueryFnData, TError, TData>,
): QueryResult<TData, TError>
```

## Factory form

Use `source` + `query` to consume an existing options factory:

```ts
const todoQuery = createQuery({
  name: 'todo.detail',
  source: { todoId: $todoId },
  query: todoOptions,
  enabled: $isEnabled,
  refetchInterval: $pollingInterval,
})

// The explicit-client overload also accepts the factory form.
const explicit = createQuery(queryClient, {
  source: $todoId,
  query: todoId => todoOptions({ todoId }),
})
```

The existing `queryKey` form is called **inline**. Both forms return the same
`QueryResult`. A `queryKey` selects inline; otherwise `source` + `query` selects
factory. Existing inline option variables/spreads may retain unrelated extra
fields called `source` or `query`; these do not activate the factory form.

- `source` is one `Store<T>` or a shallow shape of stores. Readonly derived stores
  from `combine`/`map` are supported. The callback receives plain resolved values.
- `query` is pure and synchronous. It runs during options resolution and source
  changes, even while disabled. Put network work in `queryFn`.
- The complete result is applied together. A source change updates options;
  TanStack decides whether fetching is needed. A selector-only change at the same
  key updates the projection without forcing a request.
- Top-level `name`, `enabled`, and `refetchInterval` are supported. All other
  options, including `select`, belong inside the factory result.
- A defined top-level override replaces its factory counterpart. `false` is an
  override; `undefined` inherits. This also applies to a polling store becoming
  `undefined`.
- `enabled` remains boolean. Use `combine` for derived conditions. Native helper
  return types are accepted even though their optional `enabled` type includes
  callbacks. An actual callback without a boolean override throws a diagnostic;
  the adapter does not evaluate it.
- Structured plain query keys work. Nested stores or framework refs in returned
  options are not resolved automatically.

See [reusing factories](/effector-tanstack-query/guides/queries/#reusing-query-options-factories)
for consumer composition and inference examples.

## Observer options policy

The factory form uses `notifyOnChangeProps: 'all'` for its observers, including when
client defaults or the factory request a narrower notification filter. Effector
stores and completion events need all relevant transitions; UI consumers can
subscribe to the stores they need. Input options/defaults are never mutated.

Inline preserves its existing observer behavior: notification filters are passed
through, and key/enabled/polling updates patch the observer's resolved options.
Factory updates replace the complete options object, so removed fields can fall
back to defaults for the current key. These policies differ to keep existing
inline applications backward compatible.

TanStack owns cache, fetching, retry and observer options. Effector owns source
resolution, scoped subscriptions and stores/events. UI integration owns rendering,
Suspense and error presentation. Passing `throwOnError` or
`experimental_prefetchInRender` does not install React behavior into an Effector
model. Native helper types can contain UI-only fields; they do not control the
model's activation. Use `mounted`/`unmounted` for ownership.

## Inline options

`CreateQueryOptions` extends `QueryObserverOptions` from `@tanstack/query-core`, with these adaptations:

| Field             | Type                                                                            | Notes                                                                                  |
| ----------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `queryKey`        | `EffectorQueryKey`                                                              | Array; elements may be `Store` or value                                                |
| `enabled`         | `boolean \| Store<boolean>`                                                     | Reactive — accepts a store                                                             |
| `refetchInterval` | `number \| false \| ((q) => number \| false) \| Store<number \| false \| undefined>` | Static, function form (TanStack Query), or **Store form** for runtime polling toggling |
| `name`            | `string` (recommended)                                                          | Stable name for SID-based SSR                                                          |
| ...rest           | All other `QueryObserverOptions`                                                | `staleTime`, `gcTime`, `retry`, `select`, `refetchOnMount`, `refetchOnWindowFocus`, `refetchOnReconnect`, `placeholderData`, `meta`, `networkMode`, ... |

`EffectorQueryKey`:

```ts
type ReactiveKey<K extends QueryKey> = {
  readonly [P in keyof K]: StoreOrValue<K[P]>
}
type EffectorQueryKey = ReactiveKey<QueryKey>
```

## Cancellation

`queryFn` receives the standard TanStack [`AbortSignal`](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation) as `context.signal`. Forward it to `fetch` (or any abortable API) and in-flight requests are cancelled automatically on key change, `unmounted()`, or a [`createCancel`](/effector-tanstack-query/api/cache-actions/) event — no extra wiring.

```ts
const userQuery = createQuery({
  name: 'user',
  queryKey: ['user', $userId],
  queryFn: ({ queryKey, signal }) =>
    fetch(`/api/user/${queryKey[1]}`, { signal }).then((r) => r.json()),
})
```

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
| `unmounted`          | `EventCallable<void>`                         | Decrement; the last unmount unsubscribes + cancels inflight |
| `refresh`            | `EventCallable<void>`                         | Invalidate + refetch                     |
| `prefetch`           | `EventCallable<void>`                         | `queryClient.fetchQuery` + **awaits**; for SSR / route loaders |
| `$observer`          | `Store<QueryObserver<TData, TError> \| null>` | Per-scope observer (created on `mounted()`) |
| `$queryClient`       | `Store<QueryClient \| null>`                  | Resolved client for this query           |
| `finished`           | `{ success: Event<TData>; failure: Event<TError> }` | Lifecycle events for `sample`-driven reactions |

## Lifecycle events

`finished.success` and `finished.failure` let you react to **fetch completion**
from module-level `sample` wiring — no polling on `$status`, no manual diffing.
They mirror `createMutation`'s `finished`.

| Event              | Fires when…                                                            | Payload  |
| ------------------ | --------------------------------------------------------------------- | -------- |
| `finished.success` | A fetch resolves successfully — fresh fetch, `refresh()`, reactive key change, or a cross-scope `setQueryData` | `TData` (post-`select`) |
| `finished.failure` | A fetch fails                                                         | `TError` |

```ts
const userQuery = createQuery({
  name: 'user',
  queryKey: ['user', $userId],
  queryFn: ({ queryKey }) => fetchUser(queryKey[1]),
})

// After every successful fetch, load dependent data.
sample({
  clock: userQuery.finished.success,
  target: loadSettings,
})

// Toast on every failure.
sample({
  clock: userQuery.finished.failure,
  fn: (err) => `Failed: ${err.message}`,
  target: showToast,
})
```

The payload is the data / error directly (not `{ params, result }` like a
mutation) — a query has no per-call variations, and its key is resolved by the
factory. If you need the resolved key alongside the data, add a second `sample`
that reads `$status` or the internal `__resolvedKey` store.

**Baseline — what does _not_ fire.** On the first observation in a scope (e.g.
`mounted()` over SSR-hydrated cache data) neither event fires. The events track
**new** fetches, not the initial observability of already-cached data —
otherwise every page load would re-fire `success` for hydrated data. Each fork
scope tracks its own baseline independently. Placeholder data
(`$isPlaceholderData`) never fires `success` either; only a real resolution
does. On the server, `prefetch` populates the cache without an observer
subscription, so no lifecycle events fire there.

## `prefetch` vs `mounted`

| Trigger    | What it does                                                   | `allSettled` returns when…           | Use case                                     |
| ---------- | -------------------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `mounted`  | Creates the Observer, subscribes — initial fetch runs in background | The Observer is set up               | Component mount, in-page subscription        |
| `prefetch` | Calls `queryClient.fetchQuery` and **awaits** the result       | The query has resolved (data cached) | SSR prefetch, route loaders, on-hover prime  |

A typical SSR flow uses both:

```ts
await allSettled(userQuery.prefetch, { scope })  // populates qc cache
await allSettled(userQuery.mounted, { scope })   // dispatches into $data, $status, ...
```

`prefetch` is a no-op when `enabled` is `false`.

## Generic inference

```ts
// TQueryFnData inferred from queryFn
const q1 = createQuery({
  name: 'q1',
  queryKey: ['x'],
  queryFn: () => Promise.resolve({ id: 1, name: 'A' }),
})
// q1.$data: Store<{ id: number; name: string } | undefined>

// TData narrowed via select
const q2 = createQuery({
  name: 'q2',
  queryKey: ['x'],
  queryFn: () => Promise.resolve({ id: 1, name: 'A' }),
  select: (data) => data.name,
})
// q2.$data: Store<string | undefined>
```

Custom error type:

```ts
class HttpError extends Error { code = 0 }

const q = createQuery<User, HttpError>({ /* ... */ })
// q.$error: Store<HttpError | null>
```
