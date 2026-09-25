import { expectTypeOf } from 'vitest'
import { createStore } from 'effector'
import type { Store } from 'effector'
import { createQuery, createInfiniteQuery, createMutation } from './contracts'
import { queryOptions } from './helpers/queryOptions'
import { infiniteQueryOptions } from './helpers/infiniteQueryOptions'
import { mutationOptions } from './helpers/mutationOptions'

class ApplicationError extends Error { kind = 'application' }
interface AppMeta extends Record<string, unknown> { audit: boolean }

declare module '@tanstack/query-core' {
  interface Register {
    defaultError: ApplicationError
    queryMeta: AppMeta
    mutationMeta: AppMeta
  }
}

const $id = createStore(1)
const q = createQuery({ source: $id, query: id => queryOptions({
  queryKey: ['app', id], queryFn: async () => id, meta: { audit: true },
}) })
expectTypeOf(q.$error).toEqualTypeOf<Store<ApplicationError | null>>()

const i = createInfiniteQuery({ source: $id, query: id => infiniteQueryOptions({
  queryKey: ['app', id], initialPageParam: 0,
  queryFn: async ({ pageParam }) => id + pageParam,
  getNextPageParam: last => last + 1,
}) })
expectTypeOf(i.$error).toEqualTypeOf<Store<ApplicationError | null>>()

const m = createMutation({ source: $id, mutation: id => mutationOptions({
  mutationKey: ['app', id], mutationFn: async (value: string) => ({ id, value }),
}) })
expectTypeOf(m.$error).toEqualTypeOf<Store<ApplicationError | null>>()

const legacy = createQuery({ queryKey: ['app', $id], queryFn: async () => 1 })
// Keep the existing inline default Error. A switch to DefaultError is a separate compatibility decision.
expectTypeOf(legacy.$error).toEqualTypeOf<Store<Error | null>>()

// @ts-expect-error Registered metadata requires audit.
mutationOptions({ mutationKey: ['app'], meta: {} })
