import {
  allSettled,
  createEvent,
  createStore,
  createWatch,
  fork,
  serialize,
} from 'effector'
import { QueryClient } from '@tanstack/query-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuery } from '../createQuery'
import { createMutation } from '../createMutation'
import { $queryClient } from '../queryClient'
import { queryKey, sleep } from './test-utils'

// Reference-counted mount lifecycle.
//
// Queries/mutations are module-level singletons shared by every component that
// reads them. The React hooks call mounted()/start() on each component mount
// and unmounted() on each cleanup. Before refcounting, a boolean $isMounted let
// the FIRST unmount tear the observer down while other consumers were still
// reading it — leaving them dead (refresh no-ops, reactive key changes no-ops).
// These tests pin the refcount contract.
//
// Real timers throughout (no fake timers): observer notifications and
// invalidateQueries/mutate promises settle on the microtask queue, so a small
// `sleep()` after each fetch-triggering step is enough to flush them — the same
// strategy the createMutation suite uses.

describe('createQuery refcount', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
  })

  // (a) Two consumers, one unmounts — refresh must still refetch.
  it('two consumers, one unmounts -> refresh still refetches', async () => {
    const key = queryKey()
    let count = 0
    const query = createQuery(queryClient, {
      name: 'refcount.refresh',
      queryKey: key,
      queryFn: () => Promise.resolve(++count),
      staleTime: Infinity,
    })
    const scope = fork()

    await allSettled(query.mounted, { scope })
    await allSettled(query.mounted, { scope })
    await sleep(5)
    expect(scope.getState(query.$data)).toBe(1)

    // One consumer leaves. refCount 2 -> 1, so the observer stays live.
    await allSettled(query.unmounted, { scope })
    expect(scope.getState(query.$observer)).not.toBeNull()

    await allSettled(query.refresh, { scope })
    await sleep(5)
    expect(scope.getState(query.$data)).toBe(2)
  })

  // (b) Two consumers, one unmounts — a reactive queryKey change must still
  // drive a refetch (updateObserverFx is filtered by $isMounted, which stays
  // true while a consumer remains).
  it('two consumers, one unmounts -> reactive key change still refetches', async () => {
    const key = queryKey()
    const setId = createEvent<number>()
    const $id = createStore(1).on(setId, (_, v) => v)
    const query = createQuery(queryClient, {
      name: 'refcount.keyChange',
      queryKey: [...key, $id],
      queryFn: ({ queryKey: qk }) =>
        Promise.resolve({ id: qk[qk.length - 1] }),
    })
    const scope = fork()

    await allSettled(query.mounted, { scope })
    await allSettled(query.mounted, { scope })
    await sleep(5)
    expect(scope.getState(query.$data)).toEqual({ id: 1 })

    await allSettled(query.unmounted, { scope })

    await allSettled(setId, { scope, params: 2 })
    await sleep(5)
    expect(scope.getState(query.$data)).toEqual({ id: 2 })
  })

  // (c) Only the last unmount tears the observer down.
  it('last unmount tears down the observer', async () => {
    const query = createQuery(queryClient, {
      name: 'refcount.teardown',
      queryKey: queryKey(),
      queryFn: () => Promise.resolve('x'),
    })
    const scope = fork()

    await allSettled(query.mounted, { scope })
    await allSettled(query.mounted, { scope })
    await sleep(5)
    expect(scope.getState(query.$observer)).not.toBeNull()

    // First unmount: one consumer still active — observer stays.
    await allSettled(query.unmounted, { scope })
    expect(scope.getState(query.$observer)).not.toBeNull()

    // Second (last) unmount: count hits 0 — observer destroyed + cleared.
    await allSettled(query.unmounted, { scope })
    expect(scope.getState(query.$observer)).toBeNull()
  })

  // (d) Unbalanced unmounts never drive the count negative.
  it('unbalanced unmounts never go negative', async () => {
    const key = queryKey()
    let count = 0
    const query = createQuery(queryClient, {
      name: 'refcount.unbalanced',
      queryKey: key,
      queryFn: () => Promise.resolve(++count),
      staleTime: 0,
    })
    const scope = fork()

    await allSettled(query.mounted, { scope })
    await sleep(5)
    expect(scope.getState(query.$data)).toBe(1)

    // mounted, unmounted -> count 0, observer torn down.
    await allSettled(query.unmounted, { scope })
    expect(scope.getState(query.$observer)).toBeNull()

    // Extra unmount at count 0 floors at 0 — a safe no-op, no throw.
    await allSettled(query.unmounted, { scope })
    expect(scope.getState(query.$observer)).toBeNull()

    // Mounting again works — fresh observer, active refetch (staleTime 0).
    await allSettled(query.mounted, { scope })
    await sleep(5)
    expect(scope.getState(query.$observer)).not.toBeNull()
    expect(scope.getState(query.$data)).toBe(2)

    // A single unmount now tears down again (proves the count was exactly 1,
    // not inflated by the earlier extra unmount).
    await allSettled(query.unmounted, { scope })
    expect(scope.getState(query.$observer)).toBeNull()
  })

  // (e) A mount that fails because the scope has no QueryClient compensates its
  // own increment (mountFx.fail -> decrement), so the count is not inflated.
  it('failed mount (no client) does not inflate the refcount', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    // Single-arg form routes through the global $queryClient, so a client-less
    // fork makes mountFx reject.
    const query = createQuery({
      name: 'refcount.failedMount',
      queryKey: queryKey(),
      queryFn: () => Promise.resolve('ok'),
    })

    // Scope WITHOUT a client: mountFx rejects; allSettled still resolves. The
    // increment is compensated back to 0 (nothing observable stays behind).
    const noClientScope = fork()
    await allSettled(query.mounted, { scope: noClientScope })
    expect(noClientScope.getState(query.$observer)).toBeNull()

    // Independent scope WITH a client. Per-scope isolation means the failed
    // mount above cannot inflate THIS scope's count: a single mount + single
    // unmount tears the observer down.
    const clientScope = fork({ values: [[$queryClient, queryClient]] })
    await allSettled(query.mounted, { scope: clientScope })
    await sleep(5)
    expect(clientScope.getState(query.$observer)).not.toBeNull()

    await allSettled(query.unmounted, { scope: clientScope })
    expect(clientScope.getState(query.$observer)).toBeNull()

    consoleError.mockRestore()
  })

  // (f) Per-scope isolation: tearing one scope down leaves the other live.
  it('per-scope isolation: unmount in one scope keeps the other live', async () => {
    const key = queryKey()
    let count = 0
    const clientA = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const clientB = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    clientA.mount()
    clientB.mount()

    // Single-arg factory; each scope gets its own client (and thus its own
    // cache + observer) injected via fork values.
    const query = createQuery<number>({
      name: 'refcount.perScope',
      queryKey: key,
      queryFn: () => Promise.resolve(++count),
      staleTime: Infinity,
    })
    const scopeA = fork({ values: [[$queryClient, clientA]] })
    const scopeB = fork({ values: [[$queryClient, clientB]] })

    await allSettled(query.mounted, { scope: scopeA })
    await allSettled(query.mounted, { scope: scopeB })
    await sleep(5)
    expect(scopeA.getState(query.$data)).toBeGreaterThan(0)
    const beforeB = scopeB.getState(query.$data)
    expect(beforeB).toBeGreaterThan(0)

    // Tear scope A fully down.
    await allSettled(query.unmounted, { scope: scopeA })
    expect(scopeA.getState(query.$observer)).toBeNull()

    // Scope B is untouched — observer still live and still refetches.
    expect(scopeB.getState(query.$observer)).not.toBeNull()
    await allSettled(query.refresh, { scope: scopeB })
    await sleep(5)
    expect(scopeB.getState(query.$data)).not.toBe(beforeB)

    clientA.clear()
    clientB.clear()
  })

  // (i) serialize(scope) must not carry the refcount (serialize:'ignore'),
  // while $isMounted keeps its sid for SSR back-compat.
  it('serialize(scope) excludes the runtime refcount', async () => {
    const query = createQuery(queryClient, {
      name: 'refcount.serialize',
      queryKey: queryKey(),
      queryFn: () => Promise.resolve('data'),
      staleTime: Infinity,
    })
    const scope = fork()

    await allSettled(query.mounted, { scope })
    await allSettled(query.mounted, { scope })
    await sleep(5)

    const snapshot = serialize(scope)
    // $isMounted keeps its name-derived sid → serialized (unchanged SSR
    // behavior: two live consumers => mounted).
    expect(
      snapshot['@tanstack/query-effector.refcount.serialize.$isMounted'],
    ).toBe(true)

    // The refcount store has no sid and is serialize:'ignore', so it never
    // rides through serialize(scope). Prove it by round-trip: a fresh client
    // scope forked from the snapshot starts at count 0 (not 2), so a single
    // mount + single unmount tears the observer down. If the count had been
    // serialized as 2, the client scope would sit at 3 after one mount and the
    // observer would survive the single unmount.
    const clientScope = fork({ values: snapshot })
    await allSettled(query.mounted, { scope: clientScope })
    await sleep(5)
    expect(clientScope.getState(query.$observer)).not.toBeNull()

    await allSettled(query.unmounted, { scope: clientScope })
    expect(clientScope.getState(query.$observer)).toBeNull()
  })
})

describe('createMutation refcount', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    queryClient.mount()
  })

  afterEach(() => {
    queryClient.clear()
  })

  // (g) start x2, unmounted x1 — the subscription survives, so mutate still
  // updates $data / $status.
  it('start x2, one unmount -> mutate still updates $data/$status', async () => {
    const mutation = createMutation<string, Error, number>(queryClient, {
      name: 'refcount.mutation.basic',
      mutationFn: (n: number) => Promise.resolve(`val-${n}`),
    })
    const scope = fork({ values: [[$queryClient, queryClient]] })

    await allSettled(mutation.start, { scope })
    await allSettled(mutation.start, { scope })
    await allSettled(mutation.unmounted, { scope })

    await allSettled(mutation.mutate, { scope, params: 5 })
    await sleep(20)

    expect(scope.getState(mutation.$data)).toBe('val-5')
    expect(scope.getState(mutation.$status)).toBe('success')
  })

  // (h) A 2nd start() DURING a pending mutation must not resubscribe — doing so
  // would reset the observer's prevStatus baseline to 'idle' and swallow the
  // finished.success when the in-flight mutation resolves.
  it('a 2nd start() during a pending mutation still emits finished.success', async () => {
    const success = vi.fn()
    let resolveFn: (value: string) => void = () => {}
    const mutation = createMutation<string, Error, void>(queryClient, {
      name: 'refcount.mutation.pendingStart',
      mutationFn: () =>
        new Promise<string>((resolve) => {
          resolveFn = resolve
        }),
    })
    const scope = fork({ values: [[$queryClient, queryClient]] })
    const unwatch = createWatch({
      unit: mutation.finished.success,
      scope,
      fn: success,
    })

    await allSettled(mutation.start, { scope })

    // Fire the mutation; it stays pending until we resolve the deferred.
    await allSettled(mutation.mutate, { scope })
    await sleep(5)
    expect(scope.getState(mutation.$status)).toBe('pending')

    // 2nd consumer starts WHILE the mutation is in flight.
    await allSettled(mutation.start, { scope })

    // Resolve the deferred mutationFn — the original subscription (prevStatus
    // still 'pending') fires finished.success.
    resolveFn('done')
    await sleep(20)

    expect(scope.getState(mutation.$status)).toBe('success')
    expect(scope.getState(mutation.$data)).toBe('done')
    expect(success).toHaveBeenCalledTimes(1)
    expect(success).toHaveBeenCalledWith({ params: undefined, result: 'done' })
    unwatch()
  })

  // A failed start (no client) compensates its increment; $observer stays null.
  it('failed start (no client) does not inflate the refcount', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const mutation = createMutation<string, Error, void>({
      name: 'refcount.mutation.failedStart',
      mutationFn: () => Promise.resolve('x'),
    })

    const noClientScope = fork()
    await allSettled(mutation.start, { scope: noClientScope })
    expect(noClientScope.getState(mutation.$observer)).toBeNull()

    // Independent scope with a client: one start + one unmount drops the
    // subscription cleanly (observer survives by design; a follow-up mutate is
    // inert).
    const onStatus = vi.fn()
    const clientScope = fork({ values: [[$queryClient, queryClient]] })
    const unwatch = createWatch({
      unit: mutation.$status,
      scope: clientScope,
      fn: onStatus,
    })
    await allSettled(mutation.start, { scope: clientScope })
    expect(clientScope.getState(mutation.$observer)).not.toBeNull()

    await allSettled(mutation.unmounted, { scope: clientScope })
    onStatus.mockClear()
    // Subscription dropped (last consumer left) — mutate no longer dispatches.
    await allSettled(mutation.mutate, { scope: clientScope })
    await sleep(20)
    expect(onStatus).not.toHaveBeenCalled()

    unwatch()
    consoleError.mockRestore()
  })
})
