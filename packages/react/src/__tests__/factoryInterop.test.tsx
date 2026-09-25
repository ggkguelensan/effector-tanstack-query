import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { Provider, useUnit } from 'effector-react'
import {
  allSettled,
  combine,
  createEvent,
  createStore,
  fork,
  serialize,
} from 'effector'
import type { Scope } from 'effector'
import { QueryClient, dehydrate } from '@tanstack/query-core'
import {
  HydrationBoundary,
  infiniteQueryOptions as nativeInfiniteOptions,
  queryOptions as nativeOptions,
  useInfiniteQuery as useNativeInfiniteQuery,
  useQuery as useNativeQuery,
} from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  $queryClient,
  createInfiniteQuery,
  createQuery,
  infiniteQueryOptions,
  prefetchQueries,
  queryOptions,
} from '@effector-tanstack-query/core'
import { QueryClientCompatProvider } from '../compat'
import { useInfiniteQuery, useQuery } from '../index'

let fixtureId = 0

type Todo = { id: number; title: string }
const variants: Array<{
  name: string
  options: typeof queryOptions
  infiniteOptions: typeof infiniteQueryOptions
}> = [
  {
    name: 'core helper',
    options: queryOptions,
    infiniteOptions: infiniteQueryOptions,
  },
  {
    name: 'native helper',
    options: nativeOptions,
    infiniteOptions: nativeInfiniteOptions,
  },
]

// Manual resolution makes simultaneous consumers really share an in-flight
// request; an immediately resolved mock could hide a deduplication regression.
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe.each(variants)(
  'options factory interop ($name)',
  ({ options, infiniteOptions }) => {
    const clients: QueryClient[] = []
    afterEach(() => {
      cleanup()
      for (const client of clients.splice(0)) client.clear()
    })

    function newClient() {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      clients.push(client)
      return client
    }

    function setup() {
      // Each fixture creates a distinct model: its serialized stores must have
      // distinct SIDs even when previous fixtures remain in the Effector graph.
      const name = `interop.${++fixtureId}`
      const client = newClient()
      const idChanged = createEvent<number>()
      const $id = createStore(1, { sid: `${name}.id` }).on(
        idChanged,
        (_, id) => id,
      )
      const requests: ReturnType<typeof deferred<Todo>>[] = []
      const fetchTodo = vi.fn((_id: number) => {
        const request = deferred<Todo>()
        requests.push(request)
        return request.promise
      })
      // This exact factory is consumed by both adapters without rebuilding its
      // key/function/policies or adding Effector stores to its arguments.
      const todoOptions = ({ todoId }: { todoId: number }) =>
        options({
          queryKey: ['todos', 'detail', { todoId }] as const,
          queryFn: () => fetchTodo(todoId),
          staleTime: 60_000,
        })
      const query = createQuery({
        name: `${name}.todo`,
        source: { todoId: $id },
        query: todoOptions,
      })
      const scope = fork({ values: [[$queryClient, client]] })

      function Adapter() {
        const { data, status, isFetching, error, refresh } = useQuery(query)
        return (
          <section data-testid="adapter">
            <span>{data?.title ?? 'empty'}</span>
            <span>
              {status}:{String(isFetching)}
            </span>
            {error && <span>{error.message}</span>}
            <button onClick={refresh}>adapter refresh</button>
          </section>
        )
      }
      function Native() {
        const todoId = useUnit($id)
        const { data, status, isFetching, error, refetch } = useNativeQuery(
          todoOptions({ todoId }),
        )
        return (
          <section data-testid="native">
            <span>{data?.title ?? 'empty'}</span>
            <span>
              {status}:{String(isFetching)}
            </span>
            {error && <span>{error.message}</span>}
            <button onClick={() => void refetch()}>native refetch</button>
          </section>
        )
      }
      function tree(adapter = true, native = true, currentScope = scope) {
        return (
          <Provider value={currentScope}>
            <QueryClientCompatProvider>
              {adapter && <Adapter />}
              {native && <Native />}
            </QueryClientCompatProvider>
          </Provider>
        )
      }
      return {
        name,
        client,
        query,
        scope,
        idChanged,
        $id,
        fetchTodo,
        requests,
        todoOptions,
        Adapter,
        Native,
        tree,
      }
    }

    it.each(['adapter', 'native', 'both'] as const)(
      'fetches and changes parameters through %s useQuery',
      async (consumer) => {
        const f = setup()
        const view = render(
          f.tree(consumer !== 'native', consumer !== 'adapter'),
        )
        expect(f.fetchTodo.mock.calls).toEqual([[1]])
        await act(async () => f.requests[0]!.resolve({ id: 1, title: 'first' }))
        const expectedConsumers =
          consumer === 'both' ? ['adapter', 'native'] : [consumer]
        await waitFor(() => {
          for (const name of expectedConsumers)
            expect(view.getByTestId(name).textContent).toContain(
              'firstsuccess:false',
            )
        })
        await act(() => allSettled(f.idChanged, { scope: f.scope, params: 2 }))
        expect(f.fetchTodo.mock.calls).toEqual([[1], [2]])
        await act(async () =>
          f.requests[1]!.resolve({ id: 2, title: 'second' }),
        )
        await waitFor(() => {
          for (const name of expectedConsumers)
            expect(view.getByTestId(name).textContent).toContain(
              'secondsuccess:false',
            )
        })
        expect(
          f.client.getQueryData(f.todoOptions({ todoId: 1 }).queryKey),
        ).toEqual({ id: 1, title: 'first' })
        expect(f.client.getQueryCache().getAll()).toHaveLength(2)
        expect(f.fetchTodo).toHaveBeenCalledTimes(2)
      },
    )

    it('shares cache writes, adapter refresh and native invalidation/refetch including unchanged data', async () => {
      const f = setup()
      const view = render(f.tree())
      const data = { id: 1, title: 'initial' }
      await act(async () => f.requests[0]!.resolve(data))
      await waitFor(() =>
        expect(view.getByTestId('native').textContent).toContain(
          'initialsuccess:false',
        ),
      )
      act(() =>
        f.client.setQueryData(
          f.todoOptions({ todoId: 1 }).queryKey,
          (previous) => ({ ...previous!, title: 'cache-write' }),
        ),
      )
      await waitFor(() => {
        expect(view.getByTestId('adapter').textContent).toContain('cache-write')
        expect(view.getByTestId('native').textContent).toContain('cache-write')
      })
      // The two observers remain independent but share one cache entry/request.
      for (const action of [
        'adapter refresh',
        'native refetch',
        'invalidate',
      ]) {
        if (action === 'invalidate') {
          act(() => {
            void f.client.invalidateQueries({
              queryKey: f.todoOptions({ todoId: 1 }).queryKey,
            })
          })
        } else {
          fireEvent.click(view.getByText(action))
        }
        await waitFor(() => {
          expect(view.getByTestId('adapter').textContent).toContain(
            'success:true',
          )
          expect(view.getByTestId('native').textContent).toContain(
            'success:true',
          )
        })
        await act(async () => f.requests.at(-1)!.resolve(data))
        await waitFor(() => {
          expect(view.getByTestId('adapter').textContent).toContain(
            'initialsuccess:false',
          )
          expect(view.getByTestId('native').textContent).toContain(
            'initialsuccess:false',
          )
        })
      }
      expect(f.fetchTodo).toHaveBeenCalledTimes(4)
      expect(f.client.getQueryCache().getAll()).toHaveLength(1)
    })

    it('keeps per-consumer select projections separate from the shared raw cache', async () => {
      const f = setup()
      const prefixChanged = createEvent<string>()
      const $prefix = createStore('A').on(prefixChanged, (_, prefix) => prefix)
      const selected = createQuery({
        source: { todoId: f.$id, prefix: $prefix },
        query: (params: { todoId: number; prefix: string }) => ({
          ...f.todoOptions(params),
          select: (todo) => `${params.prefix}:${todo.title}`,
        }),
      })
      function Projections() {
        const todoId = useUnit(f.$id)
        const adapter = useQuery(selected)
        const native = useNativeQuery({
          ...f.todoOptions({ todoId }),
          select: (todo) => todo.id,
        })
        return (
          <span>
            {adapter.data}/{native.data}
          </span>
        )
      }
      const view = render(
        <Provider value={f.scope}>
          <QueryClientCompatProvider>
            <Projections />
          </QueryClientCompatProvider>
        </Provider>,
      )
      await act(async () => f.requests[0]!.resolve({ id: 1, title: 'todo' }))
      await waitFor(() => view.getByText('A:todo/1'))
      await act(() =>
        allSettled(prefixChanged, { scope: f.scope, params: 'B' }),
      )
      view.getByText('B:todo/1')
      expect(f.fetchTodo).toHaveBeenCalledTimes(1)
      expect(
        f.client.getQueryData(f.todoOptions({ todoId: 1 }).queryKey),
      ).toEqual({ id: 1, title: 'todo' })
    })

    it.each(['adapter', 'native'] as const)(
      'keeps the remaining consumer live after %s unmounts and remounts',
      async (removed) => {
        const f = setup()
        const view = render(f.tree())
        await act(async () =>
          f.requests[0]!.resolve({ id: 1, title: 'initial' }),
        )
        await waitFor(() =>
          expect(view.getByTestId('native').textContent).toContain('initial'),
        )
        view.rerender(f.tree(removed !== 'adapter', removed !== 'native'))
        if (removed === 'adapter')
          expect(f.scope.getState(f.query.$observer)).toBeNull()
        else expect(f.scope.getState(f.query.$observer)).not.toBeNull()
        act(() =>
          f.client.setQueryData(f.todoOptions({ todoId: 1 }).queryKey, {
            id: 1,
            title: 'after-unmount',
          }),
        )
        await waitFor(() =>
          expect(
            view.getByTestId(removed === 'native' ? 'adapter' : 'native')
              .textContent,
          ).toContain('after-unmount'),
        )
        view.rerender(f.tree())
        await waitFor(() => {
          expect(view.getByTestId('adapter').textContent).toContain(
            'after-unmount',
          )
          expect(view.getByTestId('native').textContent).toContain(
            'after-unmount',
          )
        })
        expect(f.fetchTodo).toHaveBeenCalledTimes(1)
      },
    )

    it('shares errors and recovers both consumers when the source changes', async () => {
      const f = setup()
      const view = render(f.tree())
      await act(async () => f.requests[0]!.reject(new Error('not found')))
      await waitFor(() => {
        expect(view.getByTestId('adapter').textContent).toContain(
          'error:falsenot found',
        )
        expect(view.getByTestId('native').textContent).toContain(
          'error:falsenot found',
        )
      })
      await act(() => allSettled(f.idChanged, { scope: f.scope, params: 2 }))
      await act(async () =>
        f.requests[1]!.resolve({ id: 2, title: 'recovered' }),
      )
      await waitFor(() => {
        expect(view.getByTestId('adapter').textContent).toContain(
          'recoveredsuccess:false',
        )
        expect(view.getByTestId('native').textContent).toContain(
          'recoveredsuccess:false',
        )
      })
      expect(f.fetchTodo.mock.calls).toEqual([[1], [2]])
    })

    it('accepts readonly derived enabled stores alongside native enabled composition', async () => {
      const f = setup()
      const activeChanged = createEvent<boolean>()
      const $active = createStore(false).on(
        activeChanged,
        (_, active) => active,
      )
      const $enabled = combine(f.$id, $active, (id, active) => id > 0 && active)
      const query = createQuery({
        source: { todoId: f.$id },
        query: f.todoOptions,
        enabled: $enabled,
      })
      function Page() {
        const [todoId, enabled] = useUnit([f.$id, $enabled])
        const adapter = useQuery(query)
        const native = useNativeQuery({ ...f.todoOptions({ todoId }), enabled })
        return (
          <span>
            {adapter.fetchStatus}/{native.fetchStatus}/{adapter.data?.title}/
            {native.data?.title}
          </span>
        )
      }
      const view = render(
        <Provider value={f.scope}>
          <QueryClientCompatProvider>
            <Page />
          </QueryClientCompatProvider>
        </Provider>,
      )
      view.getByText('idle/idle//')
      expect(f.fetchTodo).not.toHaveBeenCalled()
      await act(() =>
        allSettled(activeChanged, { scope: f.scope, params: true }),
      )
      expect(f.fetchTodo).toHaveBeenCalledTimes(1)
      await act(async () => f.requests[0]!.resolve({ id: 1, title: 'enabled' }))
      await waitFor(() => view.getByText('idle/idle/enabled/enabled'))
    })

    it.each(['QueryClient', 'Effector'] as const)(
      'hydrates both consumers after %s prefetch without a loading flash or duplicate fetch',
      async (producer) => {
        const f = setup()
        const serverClient = newClient()
        const serverScope = fork({
          values: [
            [f.$id, 7],
            [$queryClient, serverClient],
          ],
        })
        const pending =
          producer === 'QueryClient'
            ? serverClient.fetchQuery(f.todoOptions({ todoId: 7 }))
            : prefetchQueries([f.query], { scope: serverScope })
        f.requests[0]!.resolve({ id: 7, title: 'server-seven' })
        await pending
        // Direct QueryClient prefetch fills the cache. Activate the model to
        // populate the Effector serialization layer without fetching again.
        if (producer === 'QueryClient')
          await allSettled(f.query.mounted, { scope: serverScope })
        const payload = JSON.parse(
          JSON.stringify({
            cache: dehydrate(serverClient),
            values: serialize(serverScope),
          }),
        )
        expect(payload.values[`${f.name}.id`]).toBe(7)
        const firstPaint: string[] = []
        function Probe() {
          const adapter = useQuery(f.query)
          const todoId = useUnit(f.$id)
          const native = useNativeQuery(f.todoOptions({ todoId }))
          const text = `${adapter.data?.title}/${native.data?.title}`
          firstPaint.push(text)
          return <span>{text}</span>
        }
        function tree(scope: Scope) {
          return (
            <Provider value={scope}>
              <QueryClientCompatProvider>
                <HydrationBoundary state={payload.cache}>
                  <Probe />
                </HydrationBoundary>
              </QueryClientCompatProvider>
            </Provider>
          )
        }
        const html = renderToString(tree(serverScope))
        expect(html).toContain('server-seven/server-seven')
        await allSettled(f.query.unmounted, { scope: serverScope })
        serverClient.clear()
        const browserScope = fork({ values: payload.values })
        await allSettled($queryClient, {
          scope: browserScope,
          params: f.client,
        })
        expect(browserScope.getState(f.$id)).toBe(7)
        expect(browserScope.getState(f.query.$data)).toEqual({
          id: 7,
          title: 'server-seven',
        })
        firstPaint.length = 0
        const container = document.createElement('div')
        container.innerHTML = html
        document.body.appendChild(container)
        const recoverable = vi.fn()
        const view = render(tree(browserScope), {
          container,
          hydrate: true,
          onRecoverableError: recoverable,
        })
        expect(firstPaint.length).toBeGreaterThan(0)
        expect(new Set(firstPaint)).toEqual(
          new Set(['server-seven/server-seven']),
        )
        expect(recoverable).not.toHaveBeenCalled()
        expect(f.fetchTodo.mock.calls).toEqual([[7]])
        act(() =>
          f.client.setQueryData(f.todoOptions({ todoId: 7 }).queryKey, {
            id: 7,
            title: 'browser-update',
          }),
        )
        await waitFor(() => view.getByText('browser-update/browser-update'))
        expect(f.fetchTodo).toHaveBeenCalledTimes(1)
      },
    )

    it('shares an infinite factory and pages appended from either hook', async () => {
      const client = newClient()
      const $category = createStore('todos')
      const fetchPage = vi.fn(async (category: string, page: number) => ({
        category,
        page,
      }))
      const pagesOptions = ({ category }: { category: string }) =>
        infiniteOptions({
          queryKey: ['pages', { category }] as const,
          initialPageParam: 0,
          queryFn: ({ pageParam }) => fetchPage(category, pageParam),
          getNextPageParam: (last) =>
            last.page < 2 ? last.page + 1 : undefined,
          staleTime: 60_000,
        })
      const query = createInfiniteQuery({
        source: { category: $category },
        query: pagesOptions,
      })
      const scope = fork({ values: [[$queryClient, client]] })
      function Page() {
        const category = useUnit($category)
        const adapter = useInfiniteQuery(query)
        const native = useNativeInfiniteQuery(pagesOptions({ category }))
        return (
          <>
            <span>
              {adapter.data?.pages.map((page) => page.page).join(',')}/
              {native.data?.pages.map((page) => page.page).join(',')}
            </span>
            <button onClick={adapter.fetchNextPage}>adapter next</button>
            <button onClick={() => void native.fetchNextPage()}>
              native next
            </button>
          </>
        )
      }
      const view = render(
        <Provider value={scope}>
          <QueryClientCompatProvider>
            <Page />
          </QueryClientCompatProvider>
        </Provider>,
      )
      await waitFor(() => view.getByText('0/0'))
      fireEvent.click(view.getByText('native next'))
      await waitFor(() => view.getByText('0,1/0,1'))
      fireEvent.click(view.getByText('adapter next'))
      await waitFor(() => view.getByText('0,1,2/0,1,2'))
      expect(fetchPage.mock.calls).toEqual([
        ['todos', 0],
        ['todos', 1],
        ['todos', 2],
      ])
      expect(
        client.getQueryData(pagesOptions({ category: 'todos' }).queryKey)
          ?.pageParams,
      ).toEqual([0, 1, 2])
    })
  },
)
