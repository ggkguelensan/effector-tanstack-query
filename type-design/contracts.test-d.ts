import { describe, it, expectTypeOf } from 'vitest'
import { createStore, createEvent, sample, attach } from 'effector'
import type { Store, Event, EventCallable } from 'effector'
import { QueryClient, skipToken } from '@tanstack/query-core'
import type { InfiniteData, QueryObserverOptions } from '@tanstack/query-core'
import {
  queryOptions as nativeQueryOptions,
  infiniteQueryOptions as nativeInfiniteQueryOptions,
  mutationOptions as nativeMutationOptions,
  useQuery, useInfiniteQuery, useQueries, useMutation, useSuspenseQuery,
} from '@tanstack/react-query'
import { createQuery, createInfiniteQuery, createMutation } from './contracts'
import type { CreateQueryFactoryOptions, SourceValue } from './contracts'
import { queryOptions } from './helpers/queryOptions'
import { infiniteQueryOptions } from './helpers/infiniteQueryOptions'
import { mutationOptions } from './helpers/mutationOptions'
import { todoOptions, type Todo } from './fixtures/todo.qo'
import { updateTodoOptions, type Patch } from './fixtures/todo.mo'
import { todoKeys } from './fixtures/todo.qk'
import { useQuery as useEffectorQuery } from '../packages/react/src/index'
import { useMutation as useEffectorMutation } from './react-contracts'

const client = new QueryClient()
const $id = createStore(1)
const $enabled = createStore(true)
const $interval = createStore<number | false | undefined>(false)
const localTodoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: todoKeys.detail(todoId),
  queryFn: async (): Promise<Todo> => ({ id: todoId, title: 'todo' }),
})
class ApiError extends Error { code = 'api' }

describe('source and factory inference', () => {
  it('accepts existing native and local .qo with both client overloads', () => {
    const a = createQuery({ source: { todoId: $id }, query: todoOptions })
    const b = createQuery(client, { source: { todoId: $id }, query: todoOptions })
    const c = createQuery({ source: { todoId: $id }, query: localTodoOptions })
    expectTypeOf(a.$data).toEqualTypeOf<Store<Todo | undefined>>()
    expectTypeOf(b.$data).toEqualTypeOf<Store<Todo | undefined>>()
    expectTypeOf(c.$data).toEqualTypeOf<Store<Todo | undefined>>()
    expectTypeOf(useEffectorQuery(a).data).toEqualTypeOf<Todo | undefined>()
  })
  it('infers the source argument for store and shape, plus post-select data', () => {
    const q = createQuery({
      source: $id,
      query: (todoId) => {
        expectTypeOf(todoId).toEqualTypeOf<number>()
        return queryOptions({ ...todoOptions({ todoId }), select: (todo) => todo.title })
      },
    })
    expectTypeOf(q.$data).toEqualTypeOf<Store<string | undefined>>()
    expectTypeOf(q.finished.success).toEqualTypeOf<Event<string>>()
    createQuery({
      source: { todoId: $id, enabled: $enabled, interval: $interval },
      query: (source) => {
        expectTypeOf(source).toEqualTypeOf<{ todoId: number; enabled: boolean; interval: number | false | undefined }>()
        return { ...todoOptions(source), enabled: source.enabled, refetchInterval: source.interval }
      },
    })
  })
  it('keeps raw factories and nested query keys typed', () => {
    const q = createQuery({
      source: { id: $id },
      query: ({ id }) => ({
        queryKey: ['todos', { id, nested: { page: 1 } }] as const,
        queryFn: async () => ({ id, title: 'todo' }),
      }),
    })
    expectTypeOf(q.$data).toEqualTypeOf<Store<Todo | undefined>>()
  })
  it('types queryFn/select inside a helper returned from the inline factory', () => {
    const q = createQuery({ source: $id, query: (id) => queryOptions({
      queryKey: todoKeys.detail(id),
      queryFn: async ({ queryKey, signal }) => {
        expectTypeOf(queryKey[2].id).toEqualTypeOf<number>()
        expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
        return { id, title: 'todo' }
      },
      select: (todo) => todo.title,
    }) })
    expectTypeOf(q.$data).toEqualTypeOf<Store<string | undefined>>()
  })
  it('supports raw composition with an explicitly typed source callback', () => {
    const q = createQuery({ source: $id, query: (todoId: number) => ({
      ...todoOptions({ todoId }),
      select: todo => {
        expectTypeOf(todo).toEqualTypeOf<Todo>()
        return todo.title
      },
    }) })
    expectTypeOf(q.$data).toEqualTypeOf<Store<string | undefined>>()
  })
  it('accepts callback enabled and types top-level polling from raw cache data', () => {
    const q = createQuery({
      source: $id,
      query: (todoId) => queryOptions({
        ...todoOptions({ todoId }),
        select: (todo) => todo.title,
        enabled: (query) => query.state.data?.id !== 0,
      }),
      enabled: $enabled,
      refetchInterval: (query) => {
        expectTypeOf(query.state.data).toEqualTypeOf<Todo | undefined>()
        return query.state.data ? false : 1000
      },
    })
    expectTypeOf(q.$data).toEqualTypeOf<Store<string | undefined>>()
    createQuery({ source: { todoId: $id }, query: todoOptions, refetchInterval: $interval })
  })
  it('carries explicitly typed errors from external factory options', () => {
    const options = (id: number): QueryObserverOptions<Todo, ApiError, string, Todo, ReturnType<typeof todoKeys.detail>> => ({
      queryKey: todoKeys.detail(id), queryFn: async () => ({ id, title: 'todo' }), select: todo => todo.title,
    })
    const q = createQuery({ source: $id, query: options })
    expectTypeOf(q.$error).toEqualTypeOf<Store<ApiError | null>>()
    expectTypeOf(q.finished.failure).toEqualTypeOf<Event<ApiError>>()
    expectTypeOf(q.$data).toEqualTypeOf<Store<string | undefined>>()
  })
  it('keeps readonly object-store values, nullable params, and empty sources', () => {
    const $params = createStore<Readonly<{ id: number | null; filters: readonly string[] }>>({ id: null, filters: [] })
    createQuery({ source: $params, query: (params) => {
      expectTypeOf(params).toEqualTypeOf<Readonly<{ id: number | null; filters: readonly string[] }>>()
      return { queryKey: ['nullable', params], queryFn: async () => params.id }
    } })
    createQuery({ source: {}, query: () => localTodoOptions({ todoId: 1 }) })
    expectTypeOf<SourceValue<{ readonly id: typeof $id }>>().toEqualTypeOf<{ id: number }>()
  })
  it('supports explicitly annotated factory contracts', () => {
    const options: CreateQueryFactoryOptions<{ todoId: typeof $id }, Todo, Error, Todo, ReturnType<typeof todoKeys.detail>> = {
      source: { todoId: $id }, query: todoOptions,
    }
    expectTypeOf(createQuery(options).$data).toEqualTypeOf<Store<Todo | undefined>>()
  })
})

describe('portable helpers', () => {
  it('tags raw data rather than selected data for get/setQueryData', () => {
    const options = queryOptions({ ...localTodoOptions({ todoId: 1 }), select: todo => todo.title })
    expectTypeOf(client.getQueryData(options.queryKey)).toEqualTypeOf<Todo | undefined>()
    client.setQueryData(options.queryKey, prev => {
      expectTypeOf(prev).toEqualTypeOf<Todo | undefined>()
      return prev && { ...prev, title: 'updated' }
    })
    // @ts-expect-error The cache stores Todo, not select's string result.
    client.setQueryData(options.queryKey, 'title')
    expectTypeOf(client.fetchQuery(options)).toEqualTypeOf<Promise<Todo>>()
    client.prefetchQuery(options)
    expectTypeOf(useQuery(options).data).toEqualTypeOf<string | undefined>()
    expectTypeOf(useSuspenseQuery(options).data).toEqualTypeOf<string>()
    expectTypeOf(useQueries({ queries: [options] as const })[0].data).toEqualTypeOf<string | undefined>()
  })
  it('preserves native initialData narrowing without promising initialized Effector stores', () => {
    const options = queryOptions({
      queryKey: ['initial'], queryFn: async (): Promise<Todo> => ({ id: 1, title: 'todo' }),
      initialData: { id: 0, title: 'initial' },
    })
    expectTypeOf(useQuery(options).data).toEqualTypeOf<Todo>()
    expectTypeOf(createQuery({ source: $id, query: () => options }).$data).toEqualTypeOf<Store<Todo | undefined>>()
    const maybe = queryOptions({ queryKey: ['maybe'], queryFn: async () => 1, initialData: (): number | undefined => undefined })
    expectTypeOf(useQuery(maybe).data).toEqualTypeOf<number | undefined>()
  })
  it('supports conditional skipToken and cache-reader options', () => {
    const skipped = queryOptions({ queryKey: ['skip'], queryFn: Math.random() ? async () => 1 : skipToken })
    expectTypeOf(createQuery({ source: $id, query: () => skipped }).$data).toEqualTypeOf<Store<number | undefined>>()
    // @ts-expect-error Suspense cannot consume conditional skipToken options.
    useSuspenseQuery(skipped)
    const cached = queryOptions<Todo>({ queryKey: ['cached'] })
    expectTypeOf(createQuery({ source: $id, query: () => cached }).$data).toEqualTypeOf<Store<Todo | undefined>>()
  })
  it('is compatible with native queryOptions composition', () => {
    const native = nativeQueryOptions({ ...localTodoOptions({ todoId: 1 }), select: todo => todo.title })
    const local = queryOptions({ ...todoOptions({ todoId: 1 }), select: todo => todo.title })
    expectTypeOf(useQuery(native).data).toEqualTypeOf<string | undefined>()
    expectTypeOf(useQuery(local).data).toEqualTypeOf<string | undefined>()
  })
  it('tags custom errors and preserves the query key tuple', () => {
    const options = queryOptions<Todo, ApiError, string, ReturnType<typeof todoKeys.detail>>({
      queryKey: todoKeys.detail(1),
      queryFn: async () => ({ id: 1, title: 'todo' }), select: todo => todo.title,
    })
    expectTypeOf(client.getQueryState(options.queryKey)?.error).toEqualTypeOf<ApiError | null | undefined>()
    expectTypeOf(options.queryKey[2].id).toEqualTypeOf<number>()
    expectTypeOf(createQuery({ source: $id, query: () => options }).$error).toEqualTypeOf<Store<ApiError | null>>()
  })
})

const feedOptions = (projectId: number) => infiniteQueryOptions({
  queryKey: ['feed', { projectId }] as const,
  initialPageParam: 0,
  queryFn: async ({ pageParam }) => {
    expectTypeOf(pageParam).toEqualTypeOf<number>()
    return { items: [{ id: projectId, title: 'todo' }], next: pageParam + 1 }
  },
  getNextPageParam: last => last.next,
})
type Page = { items: Todo[]; next: number }

describe('infinite factory', () => {
  it('infers page params and raw data, with both client overloads', () => {
    const a = createInfiniteQuery({ source: $id, query: feedOptions })
    const b = createInfiniteQuery(client, { source: $id, query: feedOptions })
    expectTypeOf(a.$data).toEqualTypeOf<Store<InfiniteData<Page> | undefined>>()
    expectTypeOf(b.$data).toEqualTypeOf<Store<InfiniteData<Page> | undefined>>()
  })
  it('keeps select and polling types separate', () => {
    const q = createInfiniteQuery({ source: $id, query: id => infiniteQueryOptions({
      ...feedOptions(id), select: data => data.pages.flatMap(page => page.items),
    }), refetchInterval: query => {
      expectTypeOf(query.state.data).toEqualTypeOf<InfiniteData<Page, number> | undefined>()
      return false
    } })
    expectTypeOf(q.$data).toEqualTypeOf<Store<Todo[] | undefined>>()
    expectTypeOf(q.finished.success).toEqualTypeOf<Event<Todo[]>>()
  })
  it('accepts a native factory and supports native consumers', () => {
    const native = (id: number) => nativeInfiniteQueryOptions({
      queryKey: ['native-feed', id], initialPageParam: '',
      queryFn: async ({ pageParam }) => ({ next: pageParam + 'a' }),
      getNextPageParam: page => page.next,
    })
    expectTypeOf(createInfiniteQuery({ source: $id, query: native }).$data)
      .toEqualTypeOf<Store<InfiniteData<{ next: string }> | undefined>>()
    expectTypeOf(useInfiniteQuery(feedOptions(1)).data).toEqualTypeOf<InfiniteData<Page> | undefined>()
    expectTypeOf(client.fetchInfiniteQuery(feedOptions(1))).toEqualTypeOf<Promise<InfiniteData<Page, number>>>()
    client.prefetchInfiniteQuery(feedOptions(1))
  })
})

describe('mutation factory', () => {
  it('keeps source params separate from mutation variables for both overloads', () => {
    const a = createMutation({ source: { todoId: $id }, mutation: updateTodoOptions })
    const b = createMutation(client, { source: { todoId: $id }, mutation: updateTodoOptions })
    expectTypeOf(a.mutate).toEqualTypeOf<EventCallable<Patch>>()
    expectTypeOf(useEffectorMutation(a).data).toEqualTypeOf<Todo | undefined>()
    expectTypeOf(a.$error).toEqualTypeOf<Store<Error | null>>()
    useEffectorMutation(a).mutateWith({ variables: { title: 'new' }, onError: (_e, _v, rollback) => {
      expectTypeOf(rollback).toEqualTypeOf<{ previousTitle: string } | undefined>()
    } })
    expectTypeOf(b.$data).toEqualTypeOf<Store<Todo | undefined>>()
    expectTypeOf(a.finished.success).toEqualTypeOf<Event<{ params: Patch; result: Todo }>>()
    const save = createEvent<Patch>()
    sample({ clock: save, target: a.mutate })
    // @ts-expect-error Source params are not automatically mutation variables.
    a.mutate({ todoId: 1 })
  })
  it('infers a local .mo factory and rollback context in callbacks', () => {
    const factory = (todoId: number) => mutationOptions({
      mutationFn: async (patch: Patch): Promise<Todo> => ({ id: todoId, ...patch }),
      onMutate: (patch) => ({ previousTitle: patch.title }),
      onError: (_error, variables, rollback) => {
        expectTypeOf(variables).toEqualTypeOf<Patch>()
        expectTypeOf(rollback).toEqualTypeOf<{ previousTitle: string } | undefined>()
      },
    })
    const m = createMutation({ source: $id, mutation: factory })
    expectTypeOf(m.mutate).toEqualTypeOf<EventCallable<Patch>>()
    expectTypeOf(useMutation(factory(1)).mutate).parameter(0).toEqualTypeOf<Patch>()
    nativeMutationOptions(factory(1))
    expectTypeOf(m.$error).toEqualTypeOf<Store<Error | null>>()
  })
  it('accepts plain options and void variables', () => {
    const m = createMutation({ source: $id, mutation: id => ({ mutationFn: async () => id }) })
    expectTypeOf(m.mutate).toEqualTypeOf<EventCallable<void>>()
    expectTypeOf(m.$data).toEqualTypeOf<Store<number | undefined>>()
    expectTypeOf(m.$error).toEqualTypeOf<Store<Error | null>>()
  })
  it('preserves explicit custom and unknown errors, unknown variables, async rollback', () => {
    const custom = (id: number) => mutationOptions<Todo, ApiError, Patch, { previous: number }>({
      mutationFn: async patch => ({ id, ...patch }), onMutate: async () => ({ previous: id }),
    })
    const m = createMutation({ source: $id, mutation: custom })
    expectTypeOf(m.$error).toEqualTypeOf<Store<ApiError | null>>()
    m.mutateWith({ variables: { title: 'new' }, onSuccess: (_data, _vars, context) => {
      expectTypeOf(context).toEqualTypeOf<{ previous: number } | undefined>()
    } })
    const unknownError = mutationOptions<number, unknown, unknown>({ mutationFn: async () => 1 })
    const u = createMutation({ source: $id, mutation: () => unknownError })
    expectTypeOf(u.$error).toEqualTypeOf<Store<unknown>>()
    expectTypeOf(u.mutate).toEqualTypeOf<EventCallable<unknown>>()
  })
})

describe('Effector consumers of shared keys', () => {
  it('uses .qk from scope-aware attached effects', () => {
    const invalidate = attach({ source: { client: createStore(client), id: $id }, effect: ({ client, id }) =>
      client.invalidateQueries({ queryKey: todoKeys.detail(id) }),
    })
    invalidate()
  })
})
