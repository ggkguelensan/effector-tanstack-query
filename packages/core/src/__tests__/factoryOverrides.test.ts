import { allSettled, createEvent, createStore, fork } from 'effector'
import { QueryClient } from '@tanstack/query-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createQuery,
  createInfiniteQuery,
  queryOptions,
  infiniteQueryOptions,
  prefetchQueries,
  $queryClient,
} from '../index'

describe('factory consumer overrides', () => {
  let client: QueryClient
  beforeEach(() => {
    vi.useFakeTimers()
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.mount()
  })
  afterEach(() => {
    client.unmount()
    client.clear()
    vi.useRealTimers()
  })

  it.each([
    ['staleTime', 500, 0],
    ['refetchOnMount', true, false],
    ['refetchOnWindowFocus', true, false],
    ['refetchOnReconnect', true, false],
    ['refetchIntervalInBackground', true, false],
    ['retryOnMount', true, false],
  ] as const)(
    'applies %s to the observer and inherits undefined',
    async (key, factoryValue, override) => {
      const changed = createEvent<number>()
      const $id = createStore(1).on(changed, (_, id) => id)
      const factory = (id: number) =>
        Object.freeze(
          queryOptions({
            queryKey: [key, id],
            queryFn: () => id,
            [key]: factoryValue,
          }),
        )
      const initial = factory(1)
      const query = createQuery(client, {
        source: $id,
        query: factory,
        [key]: override,
      })
      const inherited = createQuery(client, {
        source: $id,
        query: factory,
        [key]: undefined,
      })
      const scope = fork()
      await allSettled(query.mounted, { scope })
      await allSettled(inherited.mounted, { scope })
      expect(scope.getState(query.$observer)?.options[key]).toBe(override)
      expect(scope.getState(inherited.$observer)?.options[key]).toBe(
        factoryValue,
      )
      await allSettled(changed, { scope, params: 2 })
      expect(scope.getState(query.$observer)?.options[key]).toBe(override)
      expect(scope.getState(inherited.$observer)?.options[key]).toBe(
        factoryValue,
      )
      expect(initial[key]).toBe(factoryValue)
    },
  )

  it('replaces factory select, preserves raw cache data and keeps overrides on source updates', async () => {
    const changed = createEvent<number>()
    const $multiplier = createStore(1).on(changed, (_, n) => n)
    const raw = { id: 7, title: 'todo' }
    const queryFn = vi.fn(() => raw)
    const factorySelect = vi.fn((todo: typeof raw) => todo.title)
    const consumerSelect = vi.fn((todo: typeof raw) => todo.id)
    const options = (multiplier: number) =>
      Object.freeze(
        queryOptions({
          queryKey: ['selected'],
          queryFn,
          staleTime: Infinity,
          select: (todo) => factorySelect(todo).repeat(multiplier),
        }),
      )
    const query = createQuery(client, {
      source: $multiplier,
      query: options,
      select: consumerSelect,
    })
    const scope = fork()
    const success: number[] = []
    query.finished.success.watch((value) => success.push(value))
    await prefetchQueries([query], { scope })
    expect(scope.getState(query.$data)).toBe(7)
    expect(client.getQueryData(['selected'])).toEqual(raw)
    expect(factorySelect).not.toHaveBeenCalled()
    await allSettled(changed, { scope, params: 2 })
    expect(scope.getState(query.$data)).toBe(7)
    expect(scope.getState(query.$observer)?.options.select).toBe(consumerSelect)
    expect(queryFn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    client.setQueryData(['selected'], { id: 8, title: 'updated' })
    await vi.advanceTimersByTimeAsync(1)
    expect(scope.getState(query.$data)).toBe(8)
    expect(success).toContain(8)
  })

  it('inherits select and placeholderData when overrides are undefined', async () => {
    const query = createQuery(client, {
      source: {},
      query: () =>
        queryOptions({
          queryKey: ['inherit'],
          enabled: false,
          queryFn: () => ({ id: 1 }),
          placeholderData: { id: 3 },
          select: (todo) => `todo-${todo.id}`,
        }),
      select: undefined,
      placeholderData: undefined,
    })
    const scope = fork()
    await allSettled(query.mounted, { scope })
    expect(scope.getState(query.$data)).toBe('todo-3')
    expect(scope.getState(query.$isPlaceholderData)).toBe(true)
    expect(client.getQueryData(['inherit'])).toBeUndefined()
  })

  it('selects raw placeholder data while a new key loads', async () => {
    const changed = createEvent<number>()
    const $id = createStore(1).on(changed, (_, id) => id)
    let resolve!: (value: { id: number; title: string }) => void
    const seen: Array<{ id: number; title: string } | undefined> = []
    const query = createQuery(client, {
      source: $id,
      query: (id) =>
        queryOptions({
          queryKey: ['placeholder', id],
          queryFn: () =>
            id === 1
              ? Promise.resolve({ id, title: 'first' })
              : new Promise<{ id: number; title: string }>((done) => {
                  resolve = done
                }),
          placeholderData: { id: -1, title: 'factory' },
          select: (todo) => todo.id,
        }),
      select: (todo) => todo.title,
      placeholderData: (previous) => {
        seen.push(previous)
        return previous
      },
    })
    const scope = fork()
    await prefetchQueries([query], { scope })
    const settled = allSettled(changed, { scope, params: 2 })
    expect(scope.getState(query.$data)).toBe('first')
    expect(scope.getState(query.$isPlaceholderData)).toBe(true)
    expect(seen).toContainEqual({ id: 1, title: 'first' })
    resolve({ id: 2, title: 'second' })
    await settled
    await vi.advanceTimersByTimeAsync(1)
    expect(scope.getState(query.$data)).toBe('second')
    expect(client.getQueryData(['placeholder', 2])).toEqual({
      id: 2,
      title: 'second',
    })
  })

  it('uses consumer callbacks with raw query state', async () => {
    const staleTime = vi.fn((query: { state: { data?: { id: number } } }) =>
      query.state.data ? Infinity : 0,
    )
    const query = createQuery(client, {
      source: {},
      query: () =>
        queryOptions({
          queryKey: ['callbacks'],
          queryFn: () => ({ id: 4 }),
          staleTime: 0,
        }),
      select: (todo) => String(todo.id),
      staleTime,
    })
    const scope = fork()
    await prefetchQueries([query], { scope })
    expect(scope.getState(query.$data)).toBe('4')
    expect(staleTime).toHaveBeenCalled()
    expect(
      staleTime.mock.calls.some(([query]) => query.state.data?.id === 4),
    ).toBe(true)
  })

  it('keeps scoped prefetch data isolated with consumer selection', async () => {
    const $id = createStore(1)
    const query = createQuery({
      name: 'overrides.scoped',
      source: $id,
      query: (id) =>
        queryOptions({
          queryKey: ['scoped-overrides', id],
          queryFn: () => ({ id }),
        }),
      select: (todo) => `todo-${todo.id}`,
    })
    const a = fork({
      values: [
        [$queryClient, client],
        [$id, 2],
      ],
    })
    const b = fork({
      values: [
        [$queryClient, client],
        [$id, 3],
      ],
    })
    await allSettled(query.prefetch, { scope: a })
    expect(client.getQueryData(['scoped-overrides', 2])).toEqual({ id: 2 })
    await prefetchQueries([query], { scope: a })
    await prefetchQueries([query], { scope: b })
    expect(a.getState(query.$data)).toBe('todo-2')
    expect(b.getState(query.$data)).toBe('todo-3')
  })

  it('selects infinite raw pages, keeps cursors and applies overrides after source changes', async () => {
    const changed = createEvent<number>()
    const $step = createStore(1).on(changed, (_, n) => n)
    const calls: number[] = []
    const query = createInfiniteQuery(client, {
      source: $step,
      query: (step) =>
        infiniteQueryOptions({
          queryKey: ['override-pages'],
          initialPageParam: 0,
          queryFn: ({ pageParam }) => {
            calls.push(pageParam)
            return { cursor: pageParam }
          },
          getNextPageParam: (page) => page.cursor + step,
          select: (data) => data.pages.length,
          staleTime: 0,
        }),
      select: (data) => data.pages.map((page) => page.cursor),
      staleTime: Infinity,
      refetchOnMount: false,
    })
    const scope = fork()
    await prefetchQueries([query], { scope })
    await allSettled(changed, { scope, params: 5 })
    expect(calls).toEqual([0])
    await allSettled(query.fetchNextPage, { scope })
    await vi.advanceTimersByTimeAsync(1)
    expect(scope.getState(query.$data)).toEqual([0, 5])
    expect(client.getQueryData(['override-pages'])).toEqual({
      pages: [{ cursor: 0 }, { cursor: 5 }],
      pageParams: [0, 5],
    })
  })
})
