import { afterEach, describe, expect, it, vi } from 'vitest'
import { allSettled, createEvent, createStore, fork } from 'effector'
import { QueryClient, type QueryObserver } from '@tanstack/query-core'
import { createQuery, createInfiniteQuery } from '../index'

const clients: QueryClient[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
  vi.useRealTimers()
})

describe.each([false, true])('inline options (infinite=%s)', (infinite) => {
  it.each([false, true])(
    'retains defaults and external options across key/polling updates (store=%s)',
    async (reactive) => {
      vi.useFakeTimers()
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, notifyOnChangeProps: ['data'] },
        },
      })
      clients.push(client)
      client.setQueryDefaults(['inline', 1], { staleTime: 111, gcTime: 2222 })
      client.setQueryDefaults(['inline', 2], { staleTime: 333, gcTime: 4444 })
      const changed = createEvent<number>()
      const intervalChanged = createEvent<number | false | undefined>()
      const $id = createStore(1).on(changed, (_, id) => id)
      const $interval = createStore<number | false | undefined>(false, {
        skipVoid: false,
      }).on(intervalChanged, (_, n) => n)
      const callback = () => false as const
      const options = {
        queryKey: ['inline', $id],
        queryFn: async () => 1,
        refetchInterval: reactive ? $interval : callback,
        // Existing inline objects may carry unrelated application metadata.
        source: 'metadata',
        query: 'metadata',
      }
      const query = infinite
        ? createInfiniteQuery(client, {
            ...options,
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          })
        : createQuery(client, options)
      const scope = fork()
      await allSettled(query.mounted, { scope })
      await vi.advanceTimersByTimeAsync(1)
      const observer = scope.getState<QueryObserver<
        any,
        any,
        any,
        any,
        any
      > | null>(query.$observer)!
      expect(observer.options).toMatchObject({
        staleTime: 111,
        gcTime: 2222,
        notifyOnChangeProps: ['data'],
        refetchInterval: reactive ? false : callback,
      })
      observer.setOptions({
        ...observer.options,
        meta: { owner: 'application' },
      })
      await allSettled(changed, { scope, params: 2 })
      await vi.advanceTimersByTimeAsync(1)
      expect(observer.options).toMatchObject({
        queryKey: ['inline', 2],
        staleTime: 111,
        gcTime: 2222,
        meta: { owner: 'application' },
        notifyOnChangeProps: ['data'],
      })
      await allSettled(intervalChanged, { scope, params: undefined })
      expect(observer.options.refetchInterval).toBe(
        reactive ? undefined : callback,
      )
      await allSettled(query.unmounted, { scope })
      await allSettled(query.mounted, { scope })
      expect(
        scope.getState<QueryObserver<any, any, any, any, any> | null>(
          query.$observer,
        )?.options,
      ).toMatchObject({
        staleTime: 333,
        gcTime: 4444,
        notifyOnChangeProps: ['data'],
      })
      await allSettled(query.unmounted, { scope })
    },
  )
})
