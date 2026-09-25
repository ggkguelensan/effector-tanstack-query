// Existing application module: native helper, no Effector dependencies.
import { queryOptions } from '@tanstack/react-query'
import { todoKeys } from './todo.qk'

export interface Todo { id: number; title: string }
export const todoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: todoKeys.detail(todoId),
  queryFn: async ({ signal }): Promise<Todo> => ({ id: signal.aborted ? 0 : todoId, title: 'todo' }),
})
