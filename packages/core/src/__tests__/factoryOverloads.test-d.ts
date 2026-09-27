import { createStore, type Store } from 'effector'
import { QueryClient, type InfiniteData } from '@tanstack/query-core'
import { expectTypeOf } from 'vitest'
import { createQuery, createInfiniteQuery, queryOptions } from '../index'
import type {
  CreateQueryOptions,
  CreateInfiniteQueryOptions,
  CreateInfiniteQueryFactoryOptions,
} from '../index'

type Todo = { id: number; title: string }
const client = new QueryClient()
const $todoId = createStore(1)
const getTodo = async (): Promise<Todo> => ({ id: 1, title: 'todo' })
const titleOptions = () => ({
  queryKey: ['todo'],
  queryFn: getTodo,
  select: (todo: Todo) => todo.title,
})

// Explicit result generics must still describe inherited factory selection.
const title = createQuery<Todo, Error, string>({
  source: {},
  query: titleOptions,
})
const explicitTitle = createQuery<Todo, Error, string>(client, {
  source: {},
  query: titleOptions,
})
expectTypeOf(title.$data).toEqualTypeOf<Store<string | undefined>>()
expectTypeOf(explicitTitle.$data).toEqualTypeOf<Store<string | undefined>>()

const pageOptions = () => ({
  queryKey: ['pages'],
  queryFn: getTodo,
  initialPageParam: 0,
  getNextPageParam: () => undefined,
  select: (data: InfiniteData<Todo, number>) =>
    data.pages.map((todo) => todo.title).join(','),
})
const pages = createInfiniteQuery<Todo, Error, number, string>({
  source: {},
  query: pageOptions,
})
const explicitPages = createInfiniteQuery<Todo, Error, number, string>(client, {
  source: {},
  query: pageOptions,
})
expectTypeOf(pages.$data).toEqualTypeOf<Store<string | undefined>>()
expectTypeOf(explicitPages.$data).toEqualTypeOf<Store<string | undefined>>()

// An optional consumer selector must retain raw data for plain unselected factories.
const plainOptions = () => ({ queryKey: ['plain'], queryFn: getTodo })
declare const optionalSelect: ((todo: Todo) => number) | undefined
const optional = createQuery({
  source: {},
  query: plainOptions,
  select: optionalSelect,
})
const explicitOptional = createQuery(client, {
  source: {},
  query: plainOptions,
  select: optionalSelect,
})
expectTypeOf(optional.$data).toEqualTypeOf<Store<Todo | number | undefined>>()
expectTypeOf(explicitOptional.$data).toEqualTypeOf<
  Store<Todo | number | undefined>
>()

const plainPageOptions = () => ({
  queryKey: ['plain-pages'],
  queryFn: getTodo,
  initialPageParam: 0,
  getNextPageParam: () => undefined,
})
declare const optionalPageSelect:
  | ((data: InfiniteData<Todo, number>) => number)
  | undefined
const optionalPages = createInfiniteQuery({
  source: {},
  query: plainPageOptions,
  select: optionalPageSelect,
})
const explicitOptionalPages = createInfiniteQuery(client, {
  source: {},
  query: plainPageOptions,
  select: optionalPageSelect,
})
expectTypeOf(optionalPages.$data).toEqualTypeOf<
  Store<InfiniteData<Todo, number> | number | undefined>
>()
expectTypeOf(explicitOptionalPages.$data).toEqualTypeOf<
  Store<InfiniteData<Todo, number> | number | undefined>
>()

// Public option types retain both selection states and their generic order.
declare const configuredPages: CreateInfiniteQueryFactoryOptions<
  {},
  Todo,
  Error,
  number,
  number,
  string[],
  string
>
const configured = createInfiniteQuery(configuredPages)
expectTypeOf(configured.$data).toEqualTypeOf<
  Store<string | number | undefined>
>()

const todoOptions = ({ todoId }: { todoId: number }) =>
  queryOptions({ queryKey: ['todo', todoId], queryFn: getTodo })
const composed = createQuery({
  source: { todoId: $todoId },
  query: ({ todoId }) => todoOptions({ todoId }),
  select: (todo) => {
    expectTypeOf(todo).toEqualTypeOf<Todo>()
    return todo.title
  },
})
expectTypeOf(composed.$data).toEqualTypeOf<Store<string | undefined>>()
const annotated = createQuery({
  source: { todoId: $todoId },
  query: ({ todoId }: { todoId: number }) => ({
    ...todoOptions({ todoId }),
    select: (todo) => {
      expectTypeOf(todo).toEqualTypeOf<Todo>()
      return todo.title
    },
  }),
})
expectTypeOf(annotated.$data).toEqualTypeOf<Store<string | undefined>>()

// Parameters must keep seeing the legacy explicit-client signature.
expectTypeOf<Parameters<typeof createQuery<Todo, Error>>>().toEqualTypeOf<
  [queryClient: QueryClient, options: CreateQueryOptions<Todo, Error>]
>()
expectTypeOf<
  Parameters<typeof createInfiniteQuery<Todo, Error, number>>
>().toEqualTypeOf<
  [
    queryClient: QueryClient,
    options: CreateInfiniteQueryOptions<Todo, Error, number>,
  ]
>()

// Tuple arguments must not admit a missing options object or extra arguments.
// @ts-expect-error an explicit client requires options
createQuery(client)
// @ts-expect-error an explicit client requires options
createInfiniteQuery(client)
// @ts-expect-error calls accept at most two arguments
createQuery(client, { source: {}, query: titleOptions }, {})
// @ts-expect-error calls accept at most two arguments
createInfiniteQuery(client, { source: {}, query: pageOptions }, {})
