import { createStore } from 'effector'
import type { Store } from 'effector'
import { QueryClient } from '@tanstack/query-core'
import {
  createQuery,
  createInfiniteQuery,
  queryOptions,
  infiniteQueryOptions,
} from '@subject/core'

const client = new QueryClient()
const options = (id: number) =>
  queryOptions({
    queryKey: ['factory', { id }],
    queryFn: () => ({ id, title: 'todo' }),
  })
const query = createQuery({ source: createStore(1), query: options })
const data: Store<{ id: number; title: string } | undefined> = query.$data
const cached: { id: number; title: string } | undefined = client.getQueryData(
  options(1).queryKey,
)
client.setQueryData(
  options(1).queryKey,
  (previous) => previous && { ...previous, title: 'updated' },
)
const selected = createQuery({
  source: createStore(1),
  query: (id: number) => ({ ...options(id), select: (todo) => todo.title }),
})
const title: Store<string | undefined> = selected.$data
const pagesOptions = (id: number) =>
  infiniteQueryOptions({
    queryKey: ['pages', id],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => ({ next: pageParam + 1 }),
    getNextPageParam: (page) => page.next,
  })
const pages = createInfiniteQuery({
  source: createStore(1),
  query: pagesOptions,
})
const pageData: Store<
  { pages: { next: number }[]; pageParams: unknown[] } | undefined
> = pages.$data
void [data, cached, title, pageData]
