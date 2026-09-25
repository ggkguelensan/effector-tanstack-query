import { it } from 'vitest'
import { createEvent, createStore } from 'effector'
import { QueryClient } from '@tanstack/query-core'
import { createQuery, createInfiniteQuery, createMutation } from './contracts'
import { queryOptions } from './helpers/queryOptions'
import { infiniteQueryOptions } from './helpers/infiniteQueryOptions'
import { mutationOptions } from './helpers/mutationOptions'
import { todoOptions } from './fixtures/todo.qo'
import { updateTodoOptions } from './fixtures/todo.mo'

const client = new QueryClient()
const $id = createStore(1)
const factory = { source: { todoId: $id }, query: todoOptions }
const inline = { queryKey: ['todo'], queryFn: async () => 1 }

it('rejects incompatible sources and options, not only excess properties in literals', () => {
  // @ts-expect-error Factory source must be a Store or a shape of Stores.
  createQuery({ source: 1, query: todoOptions })
  // @ts-expect-error Raw values inside a source shape are unsupported.
  createQuery({ source: { todoId: 1 }, query: todoOptions })
  // @ts-expect-error A nested shape must be held in a Store, not recursively unwrapped.
  createQuery({ source: { nested: { todoId: $id } }, query: () => inline })
  // @ts-expect-error Events have no initial value; source is restricted to stores.
  createQuery({ source: createEvent<number>(), query: () => inline })
  // @ts-expect-error Source values must match the factory parameter.
  createQuery({ source: { todoId: createStore('id') }, query: todoOptions })
  // @ts-expect-error Factory requires source.
  createQuery({ query: todoOptions })
  // @ts-expect-error Source requires a factory.
  createQuery({ source: $id })
  const mixed = { ...inline, ...factory }
  // @ts-expect-error Explicit never fields reject mixed forms even in variables.
  createQuery(mixed)
  // @ts-expect-error Same rule with explicit client.
  createQuery(client, mixed)
  // @ts-expect-error Mixing via spread is also rejected.
  createQuery({ ...factory, queryFn: async () => 1 })
  const topLevelSelect = { ...factory, select: () => 'title' }
  // @ts-expect-error select belongs inside query in factory form.
  createQuery(topLevelSelect)
  const topLevelRetry = { ...factory, retry: 3 }
  // @ts-expect-error retry belongs inside query in factory form.
  createQuery(topLevelRetry)
  // @ts-expect-error Top-level enabled accepts booleans or Store<boolean>, not functions.
  createQuery({ ...factory, enabled: () => true })
  // @ts-expect-error Stores belong in source/overrides, not returned TanStack options.
  createQuery({ source: $id, query: id => ({ ...todoOptions({ todoId: id }), enabled: createStore(true) }) })
  // @ts-expect-error The factory is synchronous.
  createQuery({ source: $id, query: async id => todoOptions({ todoId: id }) })
  // @ts-expect-error queryKey is an array.
  createQuery({ source: $id, query: () => ({ queryKey: 'todo', queryFn: async () => 1 }) })
})

const pages = () => infiniteQueryOptions({
  queryKey: ['feed'], initialPageParam: 0,
  queryFn: async ({ pageParam }) => ({ next: pageParam + 1 }),
  getNextPageParam: page => page.next,
})

it('rejects mixed infinite forms and missing page options', () => {
  const mixed = { source: $id, query: pages, initialPageParam: 0 }
  // @ts-expect-error Page configuration belongs inside the factory.
  createInfiniteQuery(mixed)
  // @ts-expect-error Both client overloads discriminate the forms.
  createInfiniteQuery(client, mixed)
  // @ts-expect-error Infinite factory requires initialPageParam/getNextPageParam.
  createInfiniteQuery({ source: { todoId: $id }, query: todoOptions })
})

it('rejects mixed mutation forms and invalid callback placement', () => {
  const mixed = { source: { todoId: $id }, mutation: updateTodoOptions, mutationFn: async () => 1 }
  // @ts-expect-error mutationFn belongs inside the factory.
  createMutation(mixed)
  // @ts-expect-error Both client overloads discriminate the forms.
  createMutation(client, mixed)
  const callbacks = { source: { todoId: $id }, mutation: updateTodoOptions, onSuccess: () => {} }
  // @ts-expect-error Shared callbacks belong inside mutation options.
  createMutation(callbacks)
  // @ts-expect-error Query-only fields are not mutation options.
  createMutation({ source: { todoId: $id }, mutation: updateTodoOptions, enabled: true })
  // @ts-expect-error mutation is synchronous; mutationFn performs the async operation.
  createMutation({ source: $id, mutation: async () => updateTodoOptions({ todoId: 1 }) })
  // @ts-expect-error query and mutation roles cannot be swapped.
  createMutation({ source: { todoId: $id }, query: todoOptions })
  // @ts-expect-error Capturing the concrete return type must still validate mutation options.
  createMutation({ source: $id, mutation: () => ({ mutationFn: 'not a function' }) })
})

it('keeps framework and Effector fields out of the portable helpers', () => {
  // @ts-expect-error Effector metadata is not a TanStack option.
  queryOptions({ queryKey: ['x'], name: 'effector' })
  // @ts-expect-error React subscribed is not implemented by the core options helper.
  queryOptions({ queryKey: ['x'], subscribed: false })
  // @ts-expect-error Effector stores are not plain enabled options.
  queryOptions({ queryKey: ['x'], enabled: createStore(true) })
  // @ts-expect-error Wrong shape returned by select's explicitly annotated input.
  queryOptions({ queryKey: ['x'], queryFn: async () => 1, select: (x: string) => x })
  // @ts-expect-error Mutation helpers do not accept query options.
  mutationOptions({ queryKey: ['x'], queryFn: async () => 1 })
})
