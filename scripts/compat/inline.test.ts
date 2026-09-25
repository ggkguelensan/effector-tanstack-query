import { afterEach, describe, expect, it, vi } from 'vitest'
import { allSettled, createEvent, createStore, fork } from 'effector'
import { QueryClient } from '@tanstack/query-core'
import * as queryCore from '@tanstack/query-core'
import * as before from '@baseline/core'
import * as after from '../../packages/core/src/index'

afterEach(() => vi.useRealTimers())

// Run the same trace against the actual old implementation and the PR.
async function trace(
  api: typeof after,
  infinite: boolean,
  filter: boolean,
  reactive: boolean,
) {
  vi.useFakeTimers()
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, notifyOnChangeProps: filter ? ['data'] : 'all' },
    },
  })
  client.setQueryDefaults(['legacy', 1], { staleTime: 111, gcTime: 2222 })
  client.setQueryDefaults(['legacy', 2], { staleTime: 333, gcTime: 4444 })
  const changed = createEvent<number>()
  const intervalChanged = createEvent<number | false | undefined>()
  const $id = createStore(1).on(changed, (_, id) => id)
  const $interval = createStore<number | false | undefined>(false, {
    skipVoid: false,
  }).on(intervalChanged, (_, n) => n)
  const calls: number[] = []
  const options = {
    queryKey: ['legacy', $id],
    queryFn: ({ queryKey }: any) => {
      calls.push(queryKey[1])
      return Promise.resolve(queryKey[1])
    },
    refetchInterval: reactive ? $interval : () => false,
    // These unrelated properties were allowed on inline options variables.
    source: 'application metadata',
    query: 'application metadata',
  }
  const model = infinite
    ? api.createInfiniteQuery(client, {
        ...options,
        initialPageParam: 0,
        getNextPageParam: () => undefined,
      })
    : api.createQuery(client, options)
  const scope = fork()
  const snapshots: unknown[] = []
  const snapshot = () => {
    const observer = scope.getState(model.$observer)!
    snapshots.push({
      data: scope.getState(model.$data),
      status: scope.getState(model.$status),
      fetching: scope.getState(model.$isFetching),
      options: {
        key: observer.options.queryKey,
        staleTime: observer.options.staleTime,
        gcTime: observer.options.gcTime,
        notify: observer.options.notifyOnChangeProps,
        interval:
          typeof observer.options.refetchInterval === 'function'
            ? 'callback'
            : observer.options.refetchInterval,
      },
    })
  }
  await allSettled(model.mounted, { scope })
  await vi.advanceTimersByTimeAsync(1)
  snapshot()
  await allSettled(changed, { scope, params: 2 })
  await vi.advanceTimersByTimeAsync(1)
  snapshot()
  await allSettled(intervalChanged, { scope, params: undefined })
  await vi.advanceTimersByTimeAsync(1)
  snapshot()
  await allSettled(model.refresh, { scope })
  await vi.advanceTimersByTimeAsync(1)
  snapshot()
  await allSettled(model.unmounted, { scope })
  await allSettled(model.mounted, { scope })
  await vi.advanceTimersByTimeAsync(1)
  snapshot()
  await allSettled(model.unmounted, { scope })
  client.clear()
  return { snapshots, calls }
}

describe.each([false, true])('inline parity (infinite=%s)', (infinite) => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'matches master with notify filter=%s and reactive interval=%s',
    async (filter, reactive) => {
      const oldTrace = await trace(
        before as typeof after,
        infinite,
        filter,
        reactive,
      )
      const newTrace = await trace(after, infinite, filter, reactive)
      expect(newTrace).toEqual(oldTrace)
      expect(newTrace.calls).toEqual([1, 2, 2])
    },
  )
})

it.skipIf(!('skipToken' in queryCore))(
  'keeps inline skipToken prefetch behavior',
  async () => {
    const core = await import('@tanstack/query-core')
    async function run(api: typeof after) {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const query = api.createQuery(client, {
        queryKey: ['skip'],
        queryFn: core.skipToken,
      })
      await allSettled(query.prefetch, { scope: fork() })
      const entry = client.getQueryCache().getAll()[0]
      const result = {
        count: client.getQueryCache().getAll().length,
        status: entry?.state.status,
        message: entry?.state.error?.message,
      }
      client.clear()
      return result
    }
    expect(await run(after)).toEqual(await run(before as typeof after))
  },
)

it('loads portable query helpers with the installed Query Core version', async () => {
  const client = new QueryClient()
  const options = after.queryOptions({
    queryKey: ['helper'],
    queryFn: () => ({ id: 7 }),
  })
  await client.fetchQuery(options)
  expect(client.getQueryData(options.queryKey)).toEqual({ id: 7 })
  const pages = after.infiniteQueryOptions({
    queryKey: ['pages'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => pageParam,
    getNextPageParam: () => undefined,
  })
  await client.fetchInfiniteQuery(pages)
  expect(client.getQueryData(pages.queryKey)).toEqual({
    pages: [1],
    pageParams: [1],
  })
  client.clear()
})

it.each([false, true])(
  'resolves factory source changes on the installed version (infinite=%s)',
  async (infinite) => {
    vi.useFakeTimers()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const changed = createEvent<number>()
    const $id = createStore(1).on(changed, (_, id) => id)
    const factory = (id: number) =>
      after.queryOptions({
        queryKey: ['factory-source', { id }],
        queryFn: async () => id,
      })
    const pages = (id: number) =>
      after.infiniteQueryOptions({
        queryKey: ['factory-pages', { id }],
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => id + pageParam,
        getNextPageParam: () => undefined,
      })
    const model = infinite
      ? after.createInfiniteQuery(client, { source: $id, query: pages })
      : after.createQuery(client, { source: $id, query: factory })
    const scope = fork({ values: [[$id, 7]] })
    await allSettled(model.mounted, { scope })
    await vi.advanceTimersByTimeAsync(1)
    expect(scope.getState(model.$data)).toEqual(
      infinite ? { pages: [7], pageParams: [0] } : 7,
    )
    await allSettled(changed, { scope, params: 8 })
    await vi.advanceTimersByTimeAsync(1)
    expect(scope.getState(model.$data)).toEqual(
      infinite ? { pages: [8], pageParams: [0] } : 8,
    )
    await allSettled(model.unmounted, { scope })
    client.clear()
  },
)
