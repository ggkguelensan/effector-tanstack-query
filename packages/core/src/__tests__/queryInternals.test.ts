import { allSettled, createStore, fork, serialize } from 'effector'
import { QueryClient } from '@tanstack/query-core'
import { describe, expect, it } from 'vitest'
import { createQuery } from '../createQuery'
import { $queryClient } from '../queryClient'
import { getQueryInternals } from '../internal'

describe('query internals', () => {
  it('rejects a model without internals', () => {
    expect(() => getQueryInternals({ $queryClient })).toThrow(
      'Query internals are unavailable',
    )
  })

  it('keeps readers in their scopes and out of serialized state', async () => {
    const firstClient = new QueryClient()
    const secondClient = new QueryClient()
    firstClient.setQueryData(['reader', 1], { title: 'first' })
    secondClient.setQueryData(['reader', 2], { title: 'second' })
    const $id = createStore(1, { sid: 'reader.id' })
    const query = createQuery({
      name: 'reader.scoped',
      source: $id,
      query: (id) => ({
        queryKey: ['reader', id],
        queryFn: () => Promise.resolve({ title: 'network' }),
        staleTime: Infinity,
      }),
      select: (value) => value.title,
    })
    const first = fork({
      values: [
        [$queryClient, firstClient],
        [$id, 1],
      ],
    })
    const second = fork({
      values: [
        [$queryClient, secondClient],
        [$id, 2],
      ],
    })
    const { $reader } = getQueryInternals(query)
    try {
      expect(first.getState($reader)).toBeNull()
      await allSettled(query.mounted, { scope: first })
      await allSettled(query.mounted, { scope: second })
      const firstReader = first.getState($reader)
      const secondReader = second.getState($reader)
      expect(firstReader).not.toBe(secondReader)
      expect(firstReader?.read()).toMatchObject({ data: 'first' })
      expect(secondReader?.read()).toMatchObject({ data: 'second' })
      expect(serialize(first)).toEqual({
        'reader.id': 1,
        '@tanstack/query-effector.reader.scoped.$data': 'first',
        '@tanstack/query-effector.reader.scoped.$status': 'success',
      })
      for (const value of Object.values(serialize(first))) {
        expect(value).not.toBe(firstReader)
        expect(value).not.toBe(firstClient)
      }
      await allSettled(query.unmounted, { scope: first })
      expect(first.getState($reader)).toBeNull()
      expect(second.getState($reader)).toBe(secondReader)
    } finally {
      await allSettled(query.unmounted, { scope: first })
      await allSettled(query.unmounted, { scope: second })
      firstClient.clear()
      secondClient.clear()
    }
  })
})
