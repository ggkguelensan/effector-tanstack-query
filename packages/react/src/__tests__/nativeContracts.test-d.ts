import { createStore } from 'effector'
import { expectTypeOf } from 'vitest'
import {
  createQuery,
  createInfiniteQuery,
  createMutation,
} from '@effector-tanstack-query/core'
import type {
  QueryResult,
  InfiniteQueryResult,
  MutationResult,
} from '@effector-tanstack-query/core'
import {
  useQuery,
  useInfiniteQuery,
  useSuspenseQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQueries,
  useMutation,
} from '../index'

const query = createQuery({
  queryKey: ['react-contract', createStore(1)],
  queryFn: () => ({ id: 1 }),
  select: (raw) => String(raw.id),
})
const pages = createInfiniteQuery({
  queryKey: ['react-pages'],
  initialPageParam: 0,
  queryFn: ({ pageParam }) => ({ id: pageParam }),
  getNextPageParam: (raw) => raw.id + 1,
  select: (data) => data.pages.map((raw) => raw.id).join(','),
})
// Existing public view annotations remain accepted, including by Suspense.
const view: QueryResult<string> = query
const pageView: InfiniteQueryResult<string, Error, number> = pages
expectTypeOf(useQuery(query).data).toEqualTypeOf<string | undefined>()
expectTypeOf(useQuery(view).data).toEqualTypeOf<string | undefined>()
expectTypeOf(useSuspenseQuery(view).data).toEqualTypeOf<string>()
expectTypeOf(useSuspenseInfiniteQuery(pageView).data).toEqualTypeOf<string>()
expectTypeOf(useInfiniteQuery(pages).data).toEqualTypeOf<string | undefined>()
const tuple = useSuspenseQueries([
  query,
  createQuery({ queryKey: ['number'], queryFn: () => 1 }),
])
expectTypeOf(tuple[1].data).toEqualTypeOf<number>()
const numberQuery = createQuery({ queryKey: ['number'], queryFn: () => 1 })
expectTypeOf(
  useSuspenseQueries([query, numberQuery])[1].error,
).toEqualTypeOf<Error | null>()

const mutation = createMutation({
  mutationFn: async (id: number) => String(id),
  onMutate: (id) => ({ previous: id }),
})
const mutationView: MutationResult<string, Error, number> = mutation
useMutation(mutationView)
useMutation(mutation).mutateWith({
  variables: 1,
  onSuccess: (_data, _variables, context) => {
    expectTypeOf(context).toEqualTypeOf<{ previous: number } | undefined>()
  },
})
