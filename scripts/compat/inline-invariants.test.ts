import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  allSettled,
  combine,
  createEvent,
  createStore,
  fork,
  sample,
  serialize,
} from 'effector'
import type { Scope } from 'effector'
import { QueryClient, dehydrate, hydrate } from '@tanstack/query-core'
import * as baseline from '@baseline/core'
import * as current from '../../packages/core/src/index'

type Api = typeof current
const clients: QueryClient[] = []
let fixture = 0
function client() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(qc)
  return qc
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function create(api: Api, infinite: boolean, options: any, qc?: QueryClient) {
  const resolved = infinite
    ? { initialPageParam: 0, getNextPageParam: () => undefined, ...options }
    : options
  const fn = infinite ? api.createInfiniteQuery : api.createQuery
  return qc ? fn(qc, resolved) : fn(resolved)
}
function data(infinite: boolean, value: unknown) {
  return infinite ? { pages: [value], pageParams: [0] } : value
}
function state(scope: Scope, query: any) {
  return Object.fromEntries(
    [
      '$data',
      '$status',
      '$isPending',
      '$isSuccess',
      '$isError',
      '$isFetching',
      '$fetchStatus',
      '$isPlaceholderData',
      '$error',
    ].map((key) => {
      const value = scope.getState(query[key])
      return [key, value instanceof Error ? value.message : value]
    }),
  )
}
async function flush() {
  await vi.advanceTimersByTimeAsync(1)
}
async function compare(run: (api: Api, name: string) => Promise<unknown>) {
  const results = []
  for (const api of [baseline as Api, current]) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    // Distinct models must not collide in Effector's serialized SID map.
    results.push(await run(api, `invariant.${++fixture}`))
  }
  expect(results[1]).toEqual(results[0])
  return results[1]
}
afterEach(() => {
  for (const qc of clients.splice(0)) {
    qc.unmount()
    qc.clear()
  }
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe.each([false, true])(
  'remaining inline invariants (infinite=%s)',
  (infinite) => {
    it('awaits scoped prefetch, isolates concurrent requests and restores both SSR layers without fetching', async () => {
      await compare(async (api, name) => {
        const a = client(),
          b = client(),
          browser = client()
        const opened = createEvent<number>()
        const $id = createStore(1, { sid: `${name}.id` }).on(
          opened,
          (_, id) => id,
        )
        const requests: Array<
          ReturnType<typeof deferred<number>> & { id: number }
        > = []
        const query = create(api, infinite, {
          name,
          queryKey: ['scoped', $id],
          staleTime: Infinity,
          queryFn: ({ queryKey }: any) => {
            const request = { ...deferred<number>(), id: queryKey[1] }
            requests.push(request)
            return request.promise
          },
        })
        sample({ clock: opened, target: query.prefetch })
        const sa = fork({ values: [[api.$queryClient, a]] })
        const sb = fork({ values: [[api.$queryClient, b]] })
        const completed: string[] = []
        const pa = allSettled(opened, { scope: sa, params: 7 }).then(() =>
          completed.push('a'),
        )
        const pb = allSettled(opened, { scope: sb, params: 9 }).then(() =>
          completed.push('b'),
        )
        await flush()
        expect(completed).toEqual([])
        expect(requests.map((r) => r.id)).toEqual([7, 9])
        expect(sa.getState(query.$observer)).toBeNull()
        requests[1]!.resolve(9)
        await pb
        expect(completed).toEqual(['b'])
        expect(a.getQueryData(['scoped', 7])).toBeUndefined()
        requests[0]!.resolve(7)
        await pa
        expect(a.getQueryData(['scoped', 7])).toEqual(data(infinite, 7))
        expect(b.getQueryData(['scoped', 7])).toBeUndefined()
        expect(a.getQueryData(['scoped', 9])).toBeUndefined()
        // Prefetch alone fills the cache; model activation fills serializable stores.
        expect(sa.getState(query.$data)).toBeUndefined()
        await api.prefetchQueries([query], { scope: sa })
        await api.prefetchQueries([query], { scope: sb })
        expect(requests).toHaveLength(2)
        expect(sa.getState(query.$data)).toEqual(data(infinite, 7))
        expect(sb.getState(query.$data)).toEqual(data(infinite, 9))
        expect(query.$data.getState()).toBeUndefined()
        const payload = JSON.parse(
          JSON.stringify({ values: serialize(sa), cache: dehydrate(a) }),
        )
        expect(payload.values[`${name}.id`]).toBe(7)
        expect(
          payload.values[`@tanstack/query-effector.${name}.$data`],
        ).toEqual(data(infinite, 7))
        expect(
          Object.keys(payload.values).some((key) =>
            /observer|queryClient|mountCount/.test(key),
          ),
        ).toBe(false)
        await allSettled(query.unmounted, { scope: sa })
        a.clear()
        const restored = fork({ values: payload.values })
        hydrate(browser, payload.cache)
        await allSettled(api.setQueryClient, {
          scope: restored,
          params: browser,
        })
        expect(restored.getState($id)).toBe(7)
        expect(restored.getState(query.$observer)).toBeNull()
        const first = state(restored, query)
        await allSettled(query.mounted, { scope: restored })
        await flush()
        expect(state(restored, query)).toEqual(first)
        expect(requests).toHaveLength(2)
        expect(restored.getState(query.$observer)).not.toBe(
          sb.getState(query.$observer),
        )
        const normalized = Object.fromEntries(
          Object.entries(payload.values).map(([key, value]) => [
            key.replace(name, 'model'),
            value,
          ]),
        )
        await allSettled(query.unmounted, { scope: restored })
        await allSettled(query.unmounted, { scope: sb })
        return { completed, normalized, first, other: state(sb, query) }
      })
    })

    it('keeps an explicit client even when the scope injects a different one', async () => {
      await compare(async (api, name) => {
        const explicit = client(),
          scoped = client()
        const $id = createStore(1)
        const query = create(
          api,
          infinite,
          {
            name,
            queryKey: ['explicit', $id],
            staleTime: Infinity,
            queryFn: ({ queryKey }: any) => queryKey[1],
          },
          explicit,
        )
        const scope = fork({
          values: [
            [api.$queryClient, scoped],
            [$id, 8],
          ],
        })
        await api.prefetchQueries([query], { scope })
        expect(scope.getState(query.$queryClient)).toBe(explicit)
        expect(scoped.getQueryCache().getAll()).toHaveLength(0)
        expect(explicit.getQueryData(['explicit', 8])).toEqual(
          data(infinite, 8),
        )
        const result = state(scope, query)
        await allSettled(query.unmounted, { scope })
        return result
      })
    })

    it('shares ownership, cancels only obsolete/unowned requests, ignores late results and remounts once', async () => {
      await compare(async (api, name) => {
        const qc = client()
        const changed = createEvent<number>()
        const $id = createStore(1).on(changed, (_, id) => id)
        const requests: Array<
          ReturnType<typeof deferred<number>> & {
            id: number
            signal: AbortSignal
          }
        > = []
        const query = create(
          api,
          infinite,
          {
            name,
            queryKey: ['cancel', $id],
            queryFn: ({ queryKey, signal }: any) => {
              const request = { ...deferred<number>(), id: queryKey[1], signal }
              requests.push(request)
              return request.promise
            },
          },
          qc,
        )
        const scope = fork()
        await allSettled(query.unmounted, { scope })
        expect(scope.getState(query.$observer)).toBeNull()
        await allSettled(query.mounted, { scope })
        const observer = scope.getState(query.$observer)!
        const destroy = vi.spyOn(observer, 'destroy')
        const subscribe = vi.spyOn(observer, 'subscribe')
        await allSettled(query.mounted, { scope })
        expect(scope.getState(query.$observer)).toBe(observer)
        expect(subscribe).not.toHaveBeenCalled()
        expect(requests).toHaveLength(1)
        await allSettled(query.unmounted, { scope })
        expect(destroy).not.toHaveBeenCalled()
        expect(requests[0]!.signal.aborted).toBe(false)
        await allSettled(changed, { scope, params: 2 })
        expect(requests[0]!.signal.aborted).toBe(true)
        expect(requests[1]!.signal.aborted).toBe(false)
        requests[0]!.resolve(999)
        await flush()
        expect(scope.getState(query.$data)).toBeUndefined()
        await allSettled(query.unmounted, { scope })
        expect(requests[1]!.signal.aborted).toBe(true)
        // TanStack also calls destroy from unsubscribe; the public invariant
        // is last-owner cleanup, not a fixed number of internal method calls.
        expect(destroy).toHaveBeenCalled()
        const destroyCount = destroy.mock.calls.length
        expect(scope.getState(query.$observer)).toBeNull()
        await allSettled(query.unmounted, { scope })
        expect(destroy).toHaveBeenCalledTimes(destroyCount)
        requests[1]!.resolve(888)
        await flush()
        expect(scope.getState(query.$data)).toBeUndefined()
        await allSettled(query.mounted, { scope })
        expect(scope.getState(query.$observer)).not.toBe(observer)
        expect(requests.map((r) => r.id)).toEqual([1, 2, 2])
        requests[2]!.resolve(2)
        await flush()
        expect(scope.getState(query.$data)).toEqual(data(infinite, 2))
        const result = {
          destroyCount,
          state: state(scope, query),
          aborted: requests.map((r) => r.signal.aborted),
          observerCount: qc
            .getQueryCache()
            .find({ queryKey: ['cancel', 2] })!
            .getObserversCount(),
        }
        await allSettled(query.unmounted, { scope })
        expect(
          qc
            .getQueryCache()
            .find({ queryKey: ['cancel', 2] })!
            .getObserversCount(),
        ).toBe(0)
        const afterUnmount = state(scope, query)
        qc.setQueryData(['cancel', 2], data(infinite, 123))
        await flush()
        expect(state(scope, query)).toEqual(afterUnmount)
        return result
      })
    })

    it('preserves finished events, selected/raw data and same-data refetch transitions in the owning scope', async () => {
      await compare(async (api, name) => {
        const qc = client()
        const raw = { title: 'cached' }
        const requests: ReturnType<typeof deferred<typeof raw>>[] = []
        const key = ['events']
        qc.setQueryData(key, data(infinite, raw))
        const query = create(
          api,
          infinite,
          {
            name,
            queryKey: key,
            staleTime: Infinity,
            select: infinite
              ? (value: any) =>
                  value.pages.map((page: any) => page.title).join(',')
              : (value: any) => value.title,
            queryFn: () => {
              const request = deferred<typeof raw>()
              requests.push(request)
              return request.promise
            },
          },
          qc,
        )
        const $events = createStore<string[]>([])
          .on(query.finished.success, (events, value) => [
            ...events,
            `success:${value}`,
          ])
          .on(query.finished.failure, (events, error) => [
            ...events,
            `failure:${error.message}`,
          ])
        const scope = fork(),
          other = fork()
        await allSettled(query.mounted, { scope })
        expect(scope.getState($events)).toEqual([])
        expect(scope.getState(query.$data)).toBe('cached')
        const snapshots = [state(scope, query)]
        for (const failure of [false, false, true]) {
          await flush()
          const refresh = allSettled(query.refresh, { scope })
          await flush()
          expect(scope.getState(query.$isFetching)).toBe(true)
          snapshots.push(state(scope, query))
          if (failure) requests.at(-1)!.reject(new Error('failed'))
          else requests.at(-1)!.resolve(raw)
          await refresh
          await flush()
          snapshots.push(state(scope, query))
          expect(scope.getState(query.$isFetching)).toBe(false)
        }
        expect(scope.getState($events)).toEqual([
          'success:cached',
          'success:cached',
          'failure:failed',
        ])
        expect(other.getState($events)).toEqual([])
        expect($events.getState()).toEqual([])
        expect(qc.getQueryData(key)).toEqual(data(infinite, raw))
        // Selecting cached data is not a new completion.
        const observer = scope.getState(query.$observer)!
        observer.setOptions({ ...observer.options, select: () => 'projection' })
        await flush()
        expect(scope.getState($events)).toHaveLength(3)
        await allSettled(query.unmounted, { scope })
        await allSettled(query.mounted, { scope })
        await flush()
        expect(scope.getState($events)).toHaveLength(3)
        const events = scope.getState($events)
        await allSettled(query.unmounted, { scope })
        return { snapshots, events, count: requests.length }
      })
    })

    it('resolves nested combine keys, gate and polling coherently and preserves query context/hash', async () => {
      await compare(async (api, name) => {
        const qc = client()
        const changed = createEvent<number>()
        const $id = createStore(0).on(changed, (_, id) => id)
        const $language = $id.map((id) => `lang-${id}`)
        const $params = combine({
          id: $id,
          filters: combine({ language: $language }),
        })
        const $enabled = $id.map((id) => id > 0)
        const $interval = $id.map((id) => (id > 0 ? 10_000 : false))
        const calls: unknown[] = []
        const query = create(
          api,
          infinite,
          {
            name,
            queryKey: ['coherent', $params],
            enabled: $enabled,
            refetchInterval: $interval,
            meta: { consumer: 'inline' },
            queryKeyHashFn: (key) => `hash:${JSON.stringify(key)}`,
            queryFn: ({ queryKey, signal, meta, pageParam }: any) => {
              calls.push({
                key: queryKey,
                meta,
                signal: signal instanceof AbortSignal,
                page: pageParam,
              })
              return queryKey[1].id
            },
          },
          qc,
        )
        const scope = fork()
        await allSettled(query.mounted, { scope })
        await allSettled(query.prefetch, { scope })
        await allSettled(query.refresh, { scope })
        expect(calls).toEqual([])
        const observer = scope.getState(query.$observer)!
        const updates: unknown[] = []
        const original = observer.setOptions.bind(observer)
        vi.spyOn(observer, 'setOptions').mockImplementation((options: any) => {
          updates.push({
            key: options.queryKey,
            enabled: options.enabled,
            interval: options.refetchInterval,
          })
          return original(options)
        })
        await allSettled(changed, { scope, params: 1 })
        await flush()
        expect(updates).toEqual([
          {
            key: ['coherent', { id: 1, filters: { language: 'lang-1' } }],
            enabled: true,
            interval: 10_000,
          },
        ])
        expect(calls).toHaveLength(1)
        expect(scope.getState(query.$data)).toEqual(data(infinite, 1))
        const key = ['coherent', { id: 1, filters: { language: 'lang-1' } }]
        expect(
          qc.getQueryCache().get(`hash:${JSON.stringify(key)}`)?.state.data,
        ).toEqual(data(infinite, 1))
        await allSettled(changed, { scope, params: 0 })
        await flush()
        expect(calls).toHaveLength(1)
        const result = { calls, updates, state: state(scope, query) }
        await allSettled(query.unmounted, { scope })
        return result
      })
    })

    it('recovers a failed mount after client injection without leaking an ownership count', async () => {
      await compare(async (api, name) => {
        const qc = client()
        const changed = createEvent<number>()
        const $id = createStore(1).on(changed, (_, id) => id)
        let calls = 0
        const query = create(api, infinite, {
          name,
          queryKey: ['late-client', $id],
          queryFn: ({ queryKey }: any) => {
            calls++
            return queryKey[1]
          },
        })
        const scope = fork({ values: [[api.$queryClient, null]] })
        await allSettled(query.prefetch, { scope })
        await allSettled(query.refresh, { scope })
        await allSettled(query.mounted, { scope })
        await allSettled(changed, { scope, params: 2 })
        expect(calls).toBe(0)
        expect(scope.getState(query.$observer)).toBeNull()
        await allSettled(api.setQueryClient, { scope, params: qc })
        await allSettled(query.mounted, { scope })
        await flush()
        expect(calls).toBe(1)
        expect(scope.getState(query.$data)).toEqual(data(infinite, 2))
        const result = state(scope, query)
        await allSettled(query.unmounted, { scope })
        expect(scope.getState(query.$observer)).toBeNull()
        return result
      })
    })
    it.each(['initial', 'placeholder'] as const)(
      'preserves %s data, selection and external cache updates',
      async (initial) => {
        await compare(async (api, name) => {
          const qc = client()
          const request = deferred<{ title: string }>()
          const raw = { title: 'seed' }
          const key = ['seeded']
          const query = create(
            api,
            infinite,
            {
              name,
              queryKey: key,
              ...(initial === 'initial'
                ? { initialData: data(infinite, raw) }
                : { placeholderData: data(infinite, raw) }),
              select: infinite
                ? (value: any) =>
                    value.pages.map((page: any) => page.title).join(',')
                : (value: any) => value.title,
              queryFn: () => request.promise,
            },
            qc,
          )
          const $events = createStore<string[]>([]).on(
            query.finished.success,
            (values, value) => [...values, value],
          )
          const scope = fork()
          expect(scope.getState(query.$data)).toBeUndefined()
          expect(scope.getState(query.$status)).toBe('pending')
          await allSettled(query.mounted, { scope })
          expect(scope.getState(query.$data)).toBe('seed')
          expect(scope.getState(query.$isPlaceholderData)).toBe(
            initial === 'placeholder',
          )
          expect(scope.getState(query.$isFetching)).toBe(true)
          expect(scope.getState($events)).toEqual([])
          expect(qc.getQueryData(key)).toEqual(
            initial === 'initial' ? data(infinite, raw) : undefined,
          )
          const first = state(scope, query)
          await flush()
          request.resolve({ title: 'loaded' })
          await flush()
          expect(scope.getState(query.$data)).toBe('loaded')
          expect(scope.getState(query.$isPlaceholderData)).toBe(false)
          expect(scope.getState($events)).toEqual(['loaded'])
          await flush()
          qc.setQueryData(key, data(infinite, { title: 'external' }))
          await flush()
          expect(scope.getState(query.$data)).toBe('external')
          expect(qc.getQueryData(key)).toEqual(
            data(infinite, { title: 'external' }),
          )
          // The existing finished contract observes cache timestamps too; it is
          // not restricted to network responses initiated by this model.
          expect(scope.getState($events)).toEqual(['loaded', 'external'])
          const result = {
            first,
            final: state(scope, query),
            events: scope.getState($events),
          }
          await allSettled(query.unmounted, { scope })
          return result
        })
      },
    )
  },
)

it('preserves infinite cursors, page accumulation/limits, selected data and failed-page recovery', async () => {
  await compare(async (api, name) => {
    const qc = client()
    const requests: Array<
      ReturnType<typeof deferred<{ page: number }>> & { page: number }
    > = []
    const query = api.createInfiniteQuery(qc, {
      name,
      queryKey: ['cursors'],
      initialPageParam: 1,
      maxPages: 2,
      getNextPageParam: (page) => page.page + 1,
      getPreviousPageParam: (page) => page.page - 1,
      select: (value) => value.pages.map((page) => page.page),
      queryFn: ({ pageParam }) => {
        const request = { ...deferred<{ page: number }>(), page: pageParam }
        requests.push(request)
        return request.promise
      },
    })
    const scope = fork()
    await allSettled(query.fetchNextPage, { scope })
    await allSettled(query.fetchPreviousPage, { scope })
    expect(requests).toEqual([])
    await allSettled(query.mounted, { scope })
    requests[0]!.resolve({ page: 1 })
    await flush()
    expect(scope.getState(query.$data)).toEqual([1])
    const snapshots = [state(scope, query)]
    for (const [direction, page, expected] of [
      ['next', 2, [1, 2]],
      ['previous', 0, [0, 1]],
      ['next', 2, [1, 2]],
    ] as const) {
      const pending = allSettled(
        direction === 'next' ? query.fetchNextPage : query.fetchPreviousPage,
        { scope },
      )
      expect(
        scope.getState(
          direction === 'next'
            ? query.$isFetchingNextPage
            : query.$isFetchingPreviousPage,
        ),
      ).toBe(true)
      expect(requests.at(-1)!.page).toBe(page)
      requests.at(-1)!.resolve({ page })
      await pending
      await flush()
      expect(scope.getState(query.$data)).toEqual(expected)
      expect(scope.getState(query.$isFetchingNextPage)).toBe(false)
      expect(scope.getState(query.$isFetchingPreviousPage)).toBe(false)
      expect(scope.getState(query.$hasNextPage)).toBe(true)
      expect(scope.getState(query.$hasPreviousPage)).toBe(true)
      expect(qc.getQueryData(['cursors'])).toEqual({
        pages: expected.map((page) => ({ page })),
        pageParams: expected,
      })
      snapshots.push(state(scope, query))
    }
    const failure = allSettled(query.fetchNextPage, { scope })
    requests.at(-1)!.reject(new Error('page failed'))
    await failure
    await flush()
    expect(scope.getState(query.$data)).toEqual([1, 2])
    expect(scope.getState(query.$isError)).toBe(true)
    const supportsPageErrors =
      'isFetchNextPageError' in
      scope.getState(query.$observer)!.getCurrentResult()
    expect(scope.getState(query.$isFetchNextPageError)).toBe(supportsPageErrors)
    snapshots.push(state(scope, query))
    const recovery = allSettled(query.fetchNextPage, { scope })
    expect(requests.at(-1)!.page).toBe(3)
    requests.at(-1)!.resolve({ page: 3 })
    await recovery
    await flush()
    expect(scope.getState(query.$data)).toEqual([2, 3])
    expect(scope.getState(query.$isError)).toBe(false)
    expect(scope.getState(query.$isFetchNextPageError)).toBe(false)
    snapshots.push(state(scope, query))
    await allSettled(query.unmounted, { scope })
    await allSettled(query.fetchNextPage, { scope })
    expect(requests.map((r) => r.page)).toEqual([1, 2, 0, 2, 3, 3])
    return { snapshots, pages: requests.map((r) => r.page) }
  })
})

it.each([false, true])(
  'preserves retry callbacks, explicit hashes and observer option updates (infinite=%s)',
  async (infinite) => {
    await compare(async (api, name) => {
      const qc = client()
      const changed = createEvent<number>()
      const $id = createStore(1).on(changed, (_, id) => id)
      const intervalChanged = createEvent<number | false>()
      const $interval = createStore<number | false>(false).on(
        intervalChanged,
        (_, value) => value,
      )
      const retries: unknown[] = []
      let attempts = 0
      const query = create(
        api,
        infinite,
        {
          name,
          queryKey: ['policies', $id],
          queryHash: 'initial-hash',
          refetchInterval: $interval,
          staleTime: Infinity,
          retry: (count: number, error: Error) => {
            retries.push([count, error.message])
            return count < 1
          },
          retryDelay: 5,
          queryFn: async () => {
            attempts++
            if (attempts === 1) throw new Error('retryable')
            return 10
          },
        },
        qc,
      )
      const scope = fork()
      await allSettled(query.mounted, { scope })
      await vi.advanceTimersByTimeAsync(6)
      expect(attempts).toBe(2)
      expect(retries).toEqual([[0, 'retryable']])
      expect(scope.getState(query.$data)).toEqual(data(infinite, 10))
      expect(qc.getQueryCache().get('initial-hash')).toBeDefined()
      const observer = scope.getState(query.$observer)!
      // $observer was public before the PR. Reactive inline updates must keep
      // options set on that observer, as the previous patching behavior did.
      observer.setOptions({
        ...observer.options,
        meta: { owner: 'external' },
        select: () => 'manual selection',
      })
      await allSettled(intervalChanged, { scope, params: 100_000 })
      await flush()
      expect(observer.options.meta).toEqual({ owner: 'external' })
      expect(scope.getState(query.$data)).toBe('manual selection')
      await allSettled(changed, { scope, params: 2 })
      await flush()
      expect(observer.options.queryHash).toBe(JSON.stringify(['policies', 2]))
      expect(observer.options.meta).toEqual({ owner: 'external' })
      expect(scope.getState(query.$data)).toBe('manual selection')
      const result = {
        attempts,
        retries,
        state: state(scope, query),
        hashes: qc
          .getQueryCache()
          .getAll()
          .map((query) => query.queryHash)
          .sort(),
      }
      await allSettled(query.unmounted, { scope })
      return result
    })
  },
)

it.each([false, true])(
  'shares the cache but keeps subscriptions/events scoped when two forks use one client (infinite=%s)',
  async (infinite) => {
    await compare(async (api, name) => {
      const qc = client()
      const request = deferred<number>()
      let calls = 0
      const query = create(api, infinite, {
        name,
        queryKey: ['shared-scopes'],
        staleTime: Infinity,
        queryFn: () => {
          calls++
          return request.promise
        },
      })
      const $events = createStore<unknown[]>([]).on(
        query.finished.success,
        (values, value) => [...values, value],
      )
      const a = fork({ values: [[api.$queryClient, qc]] }),
        b = fork({ values: [[api.$queryClient, qc]] })
      await allSettled(query.mounted, { scope: a })
      await allSettled(query.mounted, { scope: b })
      expect(calls).toBe(1)
      expect(a.getState(query.$observer)).not.toBe(b.getState(query.$observer))
      expect(qc.getQueryCache().getAll()[0]!.getObserversCount()).toBe(2)
      request.resolve(1)
      await flush()
      expect(a.getState(query.$data)).toEqual(data(infinite, 1))
      expect(b.getState(query.$data)).toEqual(data(infinite, 1))
      expect(a.getState($events)).toEqual([data(infinite, 1)])
      expect(b.getState($events)).toEqual([data(infinite, 1)])
      await allSettled(query.unmounted, { scope: a })
      await flush()
      qc.setQueryData(['shared-scopes'], data(infinite, 2))
      await flush()
      expect(a.getState(query.$data)).toEqual(data(infinite, 1))
      expect(b.getState(query.$data)).toEqual(data(infinite, 2))
      expect(a.getState($events)).toHaveLength(1)
      expect(b.getState($events)).toHaveLength(2)
      expect(query.$data.getState()).toBeUndefined()
      expect($events.getState()).toEqual([])
      const result = {
        a: state(a, query),
        b: state(b, query),
        eventsA: a.getState($events),
        eventsB: b.getState($events),
        calls,
      }
      await allSettled(query.unmounted, { scope: b })
      return result
    })
  },
)

it.each([false, true])(
  'preserves inline notification filters rather than promising suppressed transitions (infinite=%s)',
  async (infinite) => {
    await compare(async (api, name) => {
      const qc = client()
      const raw = { id: 1 }
      const key = ['filtered']
      qc.setQueryData(key, data(infinite, raw))
      const request = deferred<typeof raw>()
      const query = create(
        api,
        infinite,
        {
          name,
          queryKey: key,
          staleTime: Infinity,
          notifyOnChangeProps: ['data'],
          queryFn: () => request.promise,
        },
        qc,
      )
      const $events = createStore<unknown[]>([]).on(
        query.finished.success,
        (values, value) => [...values, value],
      )
      const scope = fork()
      await allSettled(query.mounted, { scope })
      await flush()
      const refresh = allSettled(query.refresh, { scope })
      expect(qc.getQueryState(key)?.fetchStatus).toBe('fetching')
      expect(scope.getState(query.$isFetching)).toBe(false)
      request.resolve(raw)
      await refresh
      await flush()
      expect(qc.getQueryState(key)?.fetchStatus).toBe('idle')
      expect(scope.getState($events)).toEqual([])
      const result = state(scope, query)
      await allSettled(query.unmounted, { scope })
      return result
    })
  },
)

it.each([false, true])(
  'keeps finished timestamp semantics for completions within the same millisecond (infinite=%s)',
  async (infinite) => {
    await compare(async (api, name) => {
      const qc = client()
      const key = ['timestamp']
      qc.setQueryData(key, data(infinite, 1))
      const query = create(
        api,
        infinite,
        { name, queryKey: key, staleTime: Infinity, queryFn: async () => 1 },
        qc,
      )
      const $events = createStore<unknown[]>([]).on(
        query.finished.success,
        (values, value) => [...values, value],
      )
      const scope = fork()
      await allSettled(query.mounted, { scope })
      const before = qc.getQueryState(key)!.dataUpdatedAt
      await allSettled(query.refresh, { scope })
      expect(qc.getQueryState(key)!.dataUpdatedAt).toBe(before)
      expect(scope.getState($events)).toEqual([])
      await flush()
      await allSettled(query.refresh, { scope })
      expect(qc.getQueryState(key)!.dataUpdatedAt).toBeGreaterThan(before)
      expect(scope.getState($events)).toEqual([data(infinite, 1)])
      const result = {
        events: scope.getState($events),
        state: state(scope, query),
      }
      await allSettled(query.unmounted, { scope })
      return result
    })
  },
)
