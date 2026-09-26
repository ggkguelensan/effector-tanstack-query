---
title: Queries
description: Connect reactive parameters, reuse options factories, and control query loading with Effector.
---

This guide covers reactive query models and common loading patterns. Set up a
[QueryClient](/effector-tanstack-query/guides/query-client/) first. A model observes
cache updates only while mounted; [connect its lifecycle](#lifecycle) before
trying the recipes below.

An **options factory** such as `todoOptions` returns TanStack options. A **query
model** such as `todoQuery` exposes Effector stores and events.

| Definition | Use it when |
| --- | --- |
| Inline | You want to define the key and query function in the model |
| Factory | You want to reuse an options function or derive its options from a source |

These are alternative definitions of a model. For one query per element of an
array, see [query families](/effector-tanstack-query/guides/queries-family/).

## Reactive query keys

Start with a todo selected by an event. Assume `./api` exports this application
function (its HTTP implementation is omitted):

```ts
// api.ts — application API contract
export type Todo = { id: number; title: string }

export declare function getTodo(
  params: { todoId: number },
  options?: { signal?: AbortSignal },
): Promise<Todo>
```

Define the model in `model.ts`:

```ts
import { createEvent, createStore } from 'effector'
import { createQuery } from '@effector-tanstack-query/core'
import { getTodo } from './api'

export const todoIdChanged = createEvent<number>()
const $todoId = createStore(1).on(todoIdChanged, (_, id) => id)

export const todoQuery = createQuery({
  name: 'todo',
  queryKey: ['todos', $todoId],
  queryFn: ({ queryKey: [, todoId], signal }) =>
    getTodo({ todoId }, { signal }),
})
```

Changing the id switches the model to the corresponding cache entry. TanStack
uses the cache and options to decide whether to fetch. Include every parameter
that distinguishes the fetched data in the key.

### Object parameters with combine

Keys may contain ordinary nested objects. For reactive objects, put a combined
store at the top level of the key. This is an alternative model definition using
the same `$todoId` and API function:

```ts
import { combine } from 'effector'

const $params = combine({ todoId: $todoId })
const todoQuery = createQuery({
  name: 'todo',
  queryKey: ['todos', $params],
  queryFn: ({ queryKey: [, params], signal }) => getTodo(params, { signal }),
})
```

The resolved key is `['todos', { todoId: 1 }]`.
`['todos', { todoId: $todoId }]` would leave the nested store unresolved.
See [inline options](/effector-tanstack-query/api/create-query/#inline-options).

## Reusing query options factories

If your application already has a factory, import it unchanged. Otherwise define
one with either helper, using the `getTodo` contract above:

```ts
// queries.ts
import { queryOptions } from '@effector-tanstack-query/core'
// or: import { queryOptions } from '@tanstack/react-query'
import { getTodo } from './api'

export const todoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: ['todos', { todoId }],
  queryFn: ({ signal }) => getTodo({ todoId }, { signal }),
  staleTime: 60_000,
})
```

Use it in place of the inline definition in `model.ts`:

```ts
import { createEvent, createStore } from 'effector'
import { createQuery } from '@effector-tanstack-query/core'
import { todoOptions } from './queries'

export const todoIdChanged = createEvent<number>()
const $todoId = createStore(1).on(todoIdChanged, (_, id) => id)

export const todoQuery = createQuery({
  name: 'todo',
  source: { todoId: $todoId },
  query: todoOptions,
})
```

The factory receives `{ todoId: number }` and recomputes its options when the
source changes. It defines options; consumers decide when to execute the query.
No extra helper wrapper is required. Plain options factories also work.

### QueryClient consumer

For a loader, pass the factory result to the existing client. Here `./client`
exports the application's configured client; on a server, use a client created
for the current request:

```ts
import { queryClient } from './client'
import { todoOptions } from './queries'

const todo = await queryClient.fetchQuery(todoOptions({ todoId: 1 }))
// todo: Todo
```

### Native React consumer

The same options can be used by React Query under its QueryClientProvider:

```tsx
import { useQuery } from '@tanstack/react-query'
import { todoOptions } from './queries'

function TodoTitle({ todoId }: { todoId: number }) {
  const { data, isPending, error } = useQuery(todoOptions({ todoId }))
  if (isPending) return <p>Loading…</p>
  if (error) return <p>{error.message}</p>
  return <h1>{data.title}</h1>
}
```

### Shared cache and scopes

To share cache entries, supply the same QueryClient to native consumers and the
Effector model, either through `$queryClient` or an explicit client argument.
Reusing a factory alone does not connect separate clients. See
[QueryClient setup](/effector-tanstack-query/guides/query-client/).

For SSR, create a client and scope per request. Use
[`prefetchQueries`](/effector-tanstack-query/api/prefetch-queries/) when you need
both cached data and populated Effector stores for serialization.

## Lifecycle

Connect the model to the consumer's lifetime. In an Effector feature, route or
view events can drive mounting. Add this to the chosen `model.ts` definition:

```ts
import { createEvent, sample } from 'effector'

export const viewOpened = createEvent()
export const viewClosed = createEvent()

sample({ clock: viewOpened, target: todoQuery.mounted })
sample({ clock: viewClosed, target: todoQuery.unmounted })
```

Dispatch these events in the owning scope. Each open adds one owner; each close
releases one. The last close stops observation. Mounting does not await the
network request; use stores to observe its progress.

In React, the adapter's [useQuery](/effector-tanstack-query/react/use-query/)
handles mounting. To use Effector directly, bind both state and lifecycle events
with `useUnit`:

```tsx
// TodoTitle.tsx — alternative to the native React Query consumer above
import { useEffect } from 'react'
import { useUnit } from 'effector-react'
import { todoQuery, viewOpened, viewClosed } from './model'

function TodoTitle() {
  const { data, isPending, error, open, close } = useUnit({
    data: todoQuery.$data,
    isPending: todoQuery.$isPending,
    error: todoQuery.$error,
    open: viewOpened,
    close: viewClosed,
  })
  useEffect(() => {
    open()
    return () => close()
  }, [open, close])

  if (isPending) return <p>Loading…</p>
  if (error) return <p>{error.message}</p>
  return <h1>{data?.title}</h1>
}
```

The component's `useUnit` uses its Provider scope. After unmount, the model keeps
its last values but stops observing updates. See the
[lifecycle contract](/effector-tanstack-query/api/create-query/#queryclient-and-activation)
for multiple consumers and cache sharing.

## Consumer options

Keep reusable data definitions in the factory and add view-specific behavior at
the consumer. This recipe assumes `$todoId` and `todoOptions` from the factory
example; the following stores represent the view's state:

```ts
import { createStore } from 'effector'

const $isEnabled = createStore(true)
const $pollingInterval = createStore<number | false>(false)

const activeTodoQuery = createQuery({
  name: 'active-todo',
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

For enabled and polling, an alternative is to pass stores at the top level:

```ts
const activeTodoQuery = createQuery({
  name: 'active-todo',
  source: { todoId: $todoId },
  query: todoOptions,
  enabled: $isEnabled,
  refetchInterval: $pollingInterval,
})
```

A defined top-level value overrides the factory value; `undefined` inherits it.
Put `select` and other consumer options in the factory result. See
[override rules](/effector-tanstack-query/api/create-query/#factory-overrides).

## Control automatic loading — enabled

Derive conditions with `combine`. For example, fetch while the view is open and
its id is valid. Use `$enabled` on the chosen model definition:

```ts
import { combine, createStore } from 'effector'

const $viewActive = createStore(false)
  .on(viewOpened, () => true)
  .on(viewClosed, () => false)
const $enabled = combine($todoId, $viewActive, (id, active) => id > 0 && active)
// In createQuery options: enabled: $enabled
```

The adapter accepts boolean enabled values and stores. If a native factory
returns an enabled callback, override it with a boolean at the consumer.

### Disabled and nullable parameters

`enabled: false` does not prevent factory evaluation or narrow nullable types.
Handle a missing parameter when defining the query function. With a TanStack
version that provides `skipToken`, a nullable-id model can be defined as follows:

```ts
import { createStore } from 'effector'
import { skipToken } from '@tanstack/query-core'
import { createQuery, queryOptions } from '@effector-tanstack-query/core'
import { getTodo } from './api'

const $selectedTodoId = createStore<number | null>(null)
const selectedTodoQuery = createQuery({
  name: 'selected-todo',
  source: $selectedTodoId,
  query: (todoId: number | null) => queryOptions({
    queryKey: ['todos', { todoId }],
    queryFn: todoId === null
      ? skipToken
      : ({ signal }) => getTodo({ todoId }, { signal }),
  }),
})
```

A skip token supplies no runnable query function. Updating the source to an id
makes the query available; `refresh()` alone cannot do that.

### Dependent queries

When a second query needs data from the first, derive its parameter from `$data`
and include it in its key. For example, load comments after the todo becomes
available. Assume `getComments` has this application API contract; this recipe
also requires a TanStack version with `skipToken`:

```ts
import { skipToken } from '@tanstack/query-core'
import { queryOptions } from '@effector-tanstack-query/core'

declare function getComments(
  params: { todoId: number },
  options?: { signal?: AbortSignal },
): Promise<{ id: number; text: string }[]>

const $loadedTodoId = todoQuery.$data.map(todo => todo?.id ?? null)
const commentsQuery = createQuery({
  name: 'todo-comments',
  source: $loadedTodoId,
  query: (todoId: number | null) => queryOptions({
    queryKey: ['todo-comments', { todoId }],
    queryFn: todoId === null
      ? skipToken
      : ({ signal }) => getComments({ todoId }, { signal }),
  }),
})
```

Mount `commentsQuery` for the same view as `todoQuery`. The source supplies both
the request parameter and cache key; an enabled flag alone would not do that.

## Composing select

To expose just the title from `todoOptions`, compose a selector at the consumer:

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

The outer parameter annotation helps TypeScript infer the nested selector.
Alternatively, extract a typed selector or wrap the composed object with
`queryOptions`. A ready-made factory needs no additional wrapper.

For inline definitions, place `select` directly beside `queryFn`. The model gets
the selected result; the cache still contains `Todo`. Changing only the selector
at the same key does not force a fetch. If a selector throws, the observer reports
an error. See [select](/effector-tanstack-query/api/create-query/#select).

## Keep previous data — placeholderData

To keep displaying the previous todo while a new id loads, add this option to
the inline definition or the returned factory options:

```ts
import { keepPreviousData } from '@tanstack/query-core'

// In the query options:
placeholderData: keepPreviousData
```

Read `$isPlaceholderData` to distinguish the previous result from data for the
new key. A static value or `(previousData, previousQuery) => data` function is
also accepted. Placeholder data belongs to the observer and does not replace
cached data for the new key.

## Toggle polling — refetchInterval

Use a store to enable or disable polling for the mounted model. This recipe
uses `todoOptions` and `$todoId` from the factory example:

```ts
import { createEvent, createStore } from 'effector'

export const pollingToggled = createEvent()
const $interval = createStore<number | false>(3000)
  .on(pollingToggled, value => value === false ? 3000 : false)

const polledTodoQuery = createQuery({
  name: 'polled-todo',
  source: { todoId: $todoId },
  query: todoOptions,
  refetchInterval: $interval,
})
```

Connect `polledTodoQuery` to its consumer's lifetime as in [Lifecycle](#lifecycle).
Dispatch `pollingToggled` through `useUnit` in React or `allSettled` in a scope.
For data-dependent intervals, TanStack's `(query) => interval` callback is also
supported. See [accepted polling values](/effector-tanstack-query/api/create-query/#shared-options).

### Stop polling when a job finishes

For a separate job-status model, return `false` once the cached result is done:

```ts
declare function getJob(
  options?: { signal?: AbortSignal },
): Promise<{ done: boolean }>

const jobQuery = createQuery({
  name: 'job',
  queryKey: ['job'],
  queryFn: ({ signal }) => getJob({ signal }),
  refetchInterval: query => query.state.data?.done ? false : 1000,
})
```

This callback belongs to query options and also works in a factory result.

## Refresh data

Connect a UI action to the model:

```ts
import { createEvent, sample } from 'effector'

export const refreshClicked = createEvent()
sample({ clock: refreshClicked, target: todoQuery.refresh })
```

This invalidates the matching cache entry and refetches active, enabled queries.
It does not bypass a disabled query. Dispatch the click in the consumer's scope.

### Focus and reconnect

Set `refetchOnMount`, `refetchOnWindowFocus` and `refetchOnReconnect` in the query
options to control TanStack's automatic refetch policies. For example:

```ts
// In inline options or the factory result:
refetchOnWindowFocus: 'always',
refetchOnReconnect: false,
```

Make sure the client is [mounted](/effector-tanstack-query/guides/query-client/#set-a-default-client)
so it receives focus and online events. These settings do not mount the Effector
model themselves.

## Reacting to query updates

Use lifecycle events as clocks for Effector reactions. In this example the UI
subscribes to `todoObserved` or `$errorMessage`; no `.watch` handler is needed:

```ts
import { createEvent, createStore, sample } from 'effector'
import type { Todo } from './api'

export const todoObserved = createEvent<Todo>()
export const $errorMessage = createStore<string | null>(null)

sample({ clock: todoQuery.finished.success, target: todoObserved })
sample({
  clock: todoQuery.finished.failure,
  fn: error => error.message,
  target: $errorMessage,
})
```

Success carries selected data; failure carries an error. These events describe
observed updates, including cache writes. They do not fire for the baseline on
mount and do not guarantee one event per request. See the
[lifecycle event contract](/effector-tanstack-query/api/create-query/#lifecycle-events).
