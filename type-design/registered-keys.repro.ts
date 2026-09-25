import { expectTypeOf } from 'vitest'
import { createStore } from 'effector'
import type { Store } from 'effector'
import type { QueryKey } from '@tanstack/query-core'
import { createQuery } from './contracts'
import { queryOptions } from './helpers/queryOptions'

class ApplicationError extends Error { kind = 'application' }
type ApplicationKey = readonly ['app', ...unknown[]]
interface AppMeta extends Record<string, unknown> { audit: boolean }

declare module '@tanstack/query-core' {
  interface Register {
    defaultError: ApplicationError
    queryKey: ApplicationKey
    mutationKey: ApplicationKey
    queryMeta: AppMeta
    mutationMeta: AppMeta
  }
}

const $id = createStore(1)
const q = createQuery({ source: $id, query: id => queryOptions({ queryKey: ['app', id], queryFn: async () => id }) })
expectTypeOf(q.$error).toEqualTypeOf<Store<ApplicationError | null>>()
expectTypeOf<QueryKey>().toEqualTypeOf<ApplicationKey>()
