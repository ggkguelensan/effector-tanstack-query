import { expectTypeOf } from 'vitest'
import { createQuery } from '../createQuery'
import type { QueryResult } from '../types'
import { getQueryInternals } from '../internal'
import { attachQueryInternals } from '../queryInternals'

const query: QueryResult<number, Error> = createQuery({
  queryKey: ['reader-types'],
  queryFn: async () => 1,
})
const internals = getQueryInternals(query)
const reader = internals.$reader.getState()
if (reader) {
  const snapshot = reader.read()
  expectTypeOf(snapshot.data).toBeUnknown()
  expectTypeOf(snapshot.error).toBeUnknown()
  if (snapshot.kind === 'infinite') {
    expectTypeOf(snapshot.hasNextPage).toEqualTypeOf<boolean>()
  } else {
    // @ts-expect-error A regular query snapshot has no pagination fields.
    snapshot.hasNextPage
  }
}

// @ts-expect-error The caller cannot choose an arbitrary observer/data type.
getQueryInternals<number>(query)

attachQueryInternals(query, {
  ...internals,
  // @ts-expect-error Producers must return a reader with every required operation.
  createReader: () => ({ fetch: async () => undefined }),
})
attachQueryInternals(query, {
  ...internals,
  createReader: () => ({
    // @ts-expect-error An infinite snapshot must include pagination state.
    read: () => ({ kind: 'infinite', status: 'pending' }),
    fetch: async () => undefined,
    subscribe: () => () => {},
  }),
})
