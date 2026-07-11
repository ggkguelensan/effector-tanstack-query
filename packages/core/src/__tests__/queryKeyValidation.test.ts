import {
  allSettled,
  createEffect,
  createEvent,
  createStore,
  fork,
} from 'effector'
import { QueryClient } from '@tanstack/query-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuery } from '../createQuery'
import { createInvalidate } from '../createInvalidate'
import { createQueries } from '../createQueries'
import { $queryClient } from '../queryClient'
import { sleep } from './test-utils'

// Guards against the silent forever-pending failure documented in
// resolve.ts#scanForNestedUnit: an effector unit nested inside a queryKey
// element (a cyclic object) crashes TanStack's hashKey deep inside the mount
// effect, whose rejection is swallowed. These tests pin the fail-fast
// behavior: a synchronous, path-naming error at factory-creation time for the
// static factories, and a loud DEV console.error for the runtime-keyed
// createQueries family.

describe('queryKey validation — nested effector units', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
    vi.useRealTimers()
  })

  // a) createQuery with a store nested one level deep in an object element.
  it('throws synchronously at factory call, naming the path and "Store"', () => {
    const $store = createStore(1)
    expect(() =>
      createQuery(queryClient, {
        name: 'validation.nestedObject',
        queryKey: ['x', { page: $store }],
        queryFn: () => sleep(5).then(() => 'data'),
      }),
    ).toThrow(/queryKey\[1\]\.page.*Store/s)
  })

  // b) Deep object nesting and array nesting both report the exact path.
  it('reports the correct path for deep object nesting', () => {
    const $store = createStore(1)
    expect(() =>
      createQuery(queryClient, {
        name: 'validation.deep',
        queryKey: ['x', { a: { b: [$store] } }],
        queryFn: () => sleep(5).then(() => 'data'),
      }),
    ).toThrow(/queryKey\[1\]\.a\.b\[0\] is an effector Store/)
  })

  it('reports the correct path for array nesting', () => {
    const $store = createStore(1)
    expect(() =>
      createQuery(queryClient, {
        name: 'validation.array',
        queryKey: ['x', [$store]],
        queryFn: () => sleep(5).then(() => 'data'),
      }),
    ).toThrow(/queryKey\[1\]\[0\] is an effector Store/)
  })

  // c) A top-level Event is a unit but not the supported reactive form — it
  //    must produce a clear error rather than being silently hashed.
  it('throws a clear error for a top-level Event element', () => {
    const someEvent = createEvent<void>()
    expect(() =>
      createQuery(queryClient, {
        name: 'validation.topEvent',
        queryKey: ['x', someEvent],
        queryFn: () => sleep(5).then(() => 'data'),
      }),
    ).toThrow(/queryKey\[1\] is an effector Event/)
  })

  // c, cont.) A top-level Effect is likewise a unit but not a reactive Store —
  //    it must be rejected with the "Effect" kind, pinning the Effect arm of
  //    the top-level-unit guard (unitKind's is.effect branch).
  it('throws a clear error for a top-level Effect element', () => {
    const someEffect = createEffect<void, void>(() => undefined)
    expect(() =>
      createQuery(queryClient, {
        name: 'validation.topEffect',
        queryKey: ['x', someEffect],
        queryFn: () => sleep(5).then(() => 'data'),
      }),
    ).toThrow(/queryKey\[1\] is an effector Effect/)
  })

  // d) Plain-object keys (the normal TanStack pattern) don't throw and the
  //    query still fetches end-to-end.
  it('does not throw for a plain-object key and works end-to-end', async () => {
    const scope = fork()
    const query = createQuery(queryClient, {
      name: 'validation.plainObject',
      queryKey: ['todos', { page: 1, filters: ['a'] }],
      queryFn: () => sleep(10).then(() => 'done'),
    })

    await allSettled(query.mounted, { scope })
    await vi.advanceTimersByTimeAsync(11)

    expect(scope.getState(query.$status)).toBe('success')
    expect(scope.getState(query.$data)).toBe('done')
  })

  // d, cont.) Mixed top-level store + plain-object element keeps working; the
  //    top-level store is still unwrapped by resolveKey.
  it('unwraps a top-level store alongside a plain-object element', async () => {
    const $id = createStore(7)
    const scope = fork()
    const query = createQuery(queryClient, {
      name: 'validation.mixed',
      queryKey: ['x', $id, { page: 1 }] as const,
      queryFn: ({ queryKey }) => sleep(10).then(() => queryKey),
    })

    await allSettled(query.mounted, { scope })
    await vi.advanceTimersByTimeAsync(11)

    expect(scope.getState(query.$status)).toBe('success')
    expect(scope.getState(query.$data)).toEqual(['x', 7, { page: 1 }])
  })

  // e) createInvalidate routes through the shared resolveKey, so the same
  //    guard applies.
  it('createInvalidate throws for a nested-store key (shared resolveKey)', () => {
    const $store = createStore(1)
    expect(() =>
      createInvalidate(queryClient, {
        queryKey: ['x', { s: $store }],
      }),
    ).toThrow(/queryKey\[1\]\.s is an effector Store/)
  })

  // f) A cyclic plain object (no units) must not hang the walker. The walker
  //    passes it through; termination is the assertion.
  it('does not hang on a cyclic plain-object key element', () => {
    const cyclic: Record<string, unknown> = { name: 'root' }
    cyclic.self = cyclic
    expect(() =>
      createInvalidate(queryClient, { queryKey: ['x', cyclic] }),
    ).not.toThrow()
  })

  // g) createQueries can't validate at factory time (keys are produced by
  //    query(item) at runtime) — a DEV console.error must precede the
  //    inevitable hashKey crash.
  it('createQueries logs a DEV console.error for a nested-unit runtime key', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const $store = createStore(1)
    const $ids = createStore<number[]>([1])
    const family = createQueries<number, string>({
      name: 'validation.queriesNested',
      source: $ids,
      query: (id) => ({
        queryKey: ['bad', { page: $store }],
        queryFn: () => Promise.resolve(`v${id}`),
      }),
    })

    const scope = fork({ values: [[$queryClient, queryClient]] })
    await allSettled(family.mounted, { scope })

    expect(errorSpy).toHaveBeenCalled()
    const logged = errorSpy.mock.calls.flat().map(String).join(' ')
    expect(logged).toContain('createQueries')
    expect(logged).toContain('queryKey[1].page')
    expect(logged).toContain('Store')

    errorSpy.mockRestore()
  })

  // g, cont.) createQueries never routes its runtime key through resolveKey,
  //    so a top-level store is NOT unwrapped and crashes hashKey exactly like
  //    a nested one. The DEV diagnostic must flag it too, even though a
  //    top-level store is the supported reactive form for the static factories.
  it('createQueries logs a DEV console.error for a top-level-store runtime key', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const $store = createStore(1)
    const $ids = createStore<number[]>([1])
    const family = createQueries<number, string>({
      name: 'validation.queriesTopStore',
      source: $ids,
      query: (id) => ({
        queryKey: ['bad', $store],
        queryFn: () => Promise.resolve(`v${id}`),
      }),
    })

    const scope = fork({ values: [[$queryClient, queryClient]] })
    await allSettled(family.mounted, { scope })

    expect(errorSpy).toHaveBeenCalled()
    const logged = errorSpy.mock.calls.flat().map(String).join(' ')
    expect(logged).toContain('createQueries')
    expect(logged).toContain('queryKey[1]')
    expect(logged).toContain('Store')

    errorSpy.mockRestore()
  })

  it('createQueries skips the nested-unit scan when NODE_ENV=production', async () => {
    const prevNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    try {
      const $store = createStore(1)
      const $ids = createStore<number[]>([1])
      const family = createQueries<number, string>({
        name: 'validation.queriesNestedProd',
        source: $ids,
        query: (id) => ({
          queryKey: ['bad', { page: $store }],
          queryFn: () => Promise.resolve(`v${id}`),
        }),
      })

      const scope = fork({ values: [[$queryClient, queryClient]] })
      await allSettled(family.mounted, { scope })

      // The scan is skipped, so our dev diagnostic never fires (hashKey still
      // crashes internally, but that rejection is swallowed by allSettled).
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      process.env.NODE_ENV = prevNodeEnv
    }
  })
})
