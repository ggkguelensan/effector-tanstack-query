---
title: queryOptions / infiniteQueryOptions
description: Portable options definitions with typed cache keys, without a UI dependency.
---

These helpers return the object you pass in. They add no runtime behavior and
depend only on `@tanstack/query-core`. Their overloads and `DataTag` keys are
adapted from TanStack React Query 5.100.10 (MIT; attribution ships with core),
with compatibility types for earlier v5 releases.

```ts
import { queryOptions } from '@effector-tanstack-query/core'

type Todo = { id: number; title: string }
const todoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: ['todos', 'detail', { todoId }],
  queryFn: async ({ signal }): Promise<Todo> => {
    const response = await fetch(`/api/todos/${todoId}`, { signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  },
  staleTime: 60_000,
})

queryClient.getQueryData(todoOptions({ todoId: 1 }).queryKey)
// Todo | undefined

queryClient.setQueryData(todoOptions({ todoId: 1 }).queryKey, previous =>
  previous ? { ...previous, title: 'Updated' } : previous,
)
```

The key describes **raw cache data**, even when `select` projects the observer
result to another type. Registered query keys, metadata and default errors from
TanStack's `Register` interface are respected.

`infiniteQueryOptions` preserves the inference of `initialPageParam`, page
functions and selectors:

```ts
import { infiniteQueryOptions } from '@effector-tanstack-query/core'

const postsOptions = ({ category }: { category: string }) => infiniteQueryOptions({
  queryKey: ['posts', { category }],
  initialPageParam: 0,
  queryFn: ({ pageParam, signal }) => fetchPosts(category, pageParam, signal),
  getNextPageParam: lastPage => lastPage.nextCursor,
})
```

As with the upstream 5.100.10 helper, some infinite helper/cache-tag types use
`InfiniteData<Page, unknown>`; this does not make the query function's inferred
`pageParam` unknown. Do not assume every helper return preserves a precise
`pageParams` array type.

## Consumers and compatibility

Use the same definitions with `QueryClient`, native UI hooks, and the Effector
[factory form](/effector-tanstack-query/api/create-query/#factory-form).
Helpers are optional: plain objects and existing native helpers with
core-compatible options also work. No Effector-specific brand is required.

The helpers describe portable TanStack options. Each consumer applies its own
contract. In particular, the Effector adapters support boolean `enabled` values;
derive reactive conditions with `combine`. A native helper's broad return type
is accepted, but an actual callback `enabled` requires a boolean override at the
Effector consumption site. Other framework refs/signals are not unwrapped.

The existing Query Core peer range remains **^5.0.0**, with TypeScript **5.7+**
tested. Helpers use the data-tag symbols available in the installed core; error
tags and `skipToken` apply only where that TanStack version supports them. Keep
native Query packages on matching versions.

Helper `initialData` overloads preserve native compatibility. Effector `$data`
still includes `undefined` because model creation and observer activation are
separate lifecycle steps.
