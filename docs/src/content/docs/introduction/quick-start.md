---
title: Quick start
description: Build a query, mount it, and read its data — in two minutes.
---

## 1. Set up the QueryClient

The `QueryClient` is the same object used by TanStack Query. Create one and call `.mount()` so it can subscribe to focus / online events. Then register it with `setQueryClient` — query models will use it automatically.

```ts
import { QueryClient } from '@tanstack/query-core'
import { setQueryClient } from '@effector-tanstack-query/core'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
queryClient.mount()
setQueryClient(queryClient)
```

For SSR / per-request isolation, inject the client per scope via `fork({ values: [[$queryClient, queryClient]] })` instead — see [SSR](/effector-tanstack-query/guides/ssr/).

## 2. Create a query

```ts
import { createQuery } from '@effector-tanstack-query/core'

export const userQuery = createQuery({
  name: 'user',
  queryKey: ['user', 1],
  queryFn: () => fetch('/api/users/1').then((r) => r.json()),
})
```

You can also pass the client explicitly: `createQuery(queryClient, options)`.

The `name` is optional but **strongly recommended** — it gives the internal stores stable SIDs so they round-trip via `serialize(scope)` / `fork({ values })` for SSR. ([Why?](/effector-tanstack-query/guides/naming-and-sids/))

## 3. Read its state

`createQuery` returns an object with effector stores and events:

```ts
userQuery.$data        // Store<User | undefined>
userQuery.$error       // Store<Error | null>
userQuery.$status      // Store<'pending' | 'success' | 'error'>
userQuery.$isPending   // Store<boolean>
userQuery.$isFetching  // Store<boolean>
userQuery.mounted      // EventCallable<void>  — start the subscription
userQuery.refresh      // EventCallable<void>  — invalidate + refetch
```

Subscribe to state updates and activate the model:

```ts
const stopWatching = userQuery.$data.watch(data => console.log(data))
userQuery.mounted()
```

When the consumer is released, clean up its subscription:

```ts
userQuery.unmounted()
stopWatching()
```

Mounting subscribes the observer; it does not wait for the network request.
To await data in a test or server loader, inject a fresh client into a scope and
use `prefetchQueries` to fetch data and populate the model stores:

```ts
import { fork, allSettled } from 'effector'
import { $queryClient, prefetchQueries } from '@effector-tanstack-query/core'

const queryClient = new QueryClient()
const scope = fork({ values: [[$queryClient, queryClient]] })
await prefetchQueries([userQuery], { scope })
// After a successful request, scope.getState(userQuery.$data) contains the user.
await allSettled(userQuery.unmounted, { scope })
```

## 4. Use in React (optional)

```tsx
import { useQuery } from '@effector-tanstack-query/react'

function UserProfile() {
  const { data, isPending, error, refresh } = useQuery(userQuery)

  if (isPending) return <p>Loading…</p>
  if (error) return <p>Error: {error.message}</p>

  return (
    <div>
      <h1>{data.name}</h1>
      <button onClick={refresh}>Refresh</button>
    </div>
  )
}
```

The hook calls `mounted()` on mount and `unmounted()` on cleanup automatically.

## 5. Make the key reactive

Put a `Store` into `queryKey` to make the key reactive. TanStack uses the resolved
key, cache and options to decide whether to fetch.

```ts
import { createStore, createEvent } from 'effector'

const setUserId = createEvent<number>()
const $userId = createStore(1).on(setUserId, (_, id) => id)

const userQuery = createQuery({
  name: 'user',
  queryKey: ['user', $userId],
  queryFn: ({ queryKey }) =>
    fetch(`/api/users/${queryKey[1]}`).then((r) => r.json()),
})

userQuery.mounted()
setUserId(2) // switches to key ['user', 2]
```

## What's next

- Read [Queries](/effector-tanstack-query/guides/queries/) for `enabled`, `placeholderData`, `select`, and `refetchInterval`.
- Read [Mutations](/effector-tanstack-query/guides/mutations/) for `mutateWith`, `finished` events, `createInvalidate`, and offline behavior.
- For full type signatures, see the [API reference](/effector-tanstack-query/api/create-query/).
- Browse runnable apps in [`examples/`](https://github.com/ilyaagarkov/effector-tanstack-query/tree/master/examples): `examples/csr` (Vite + React, every common pattern) and `examples/ssr` (Next.js App Router with `query.prefetch`).
