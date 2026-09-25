// Existing application module: native helper, variables separate from context.
import { mutationOptions } from '@tanstack/react-query'
import type { Todo } from './todo.qo'

export interface Patch { title: string }
export const updateTodoOptions = ({ todoId }: { todoId: number }) => mutationOptions({
  mutationKey: ['todos', todoId, 'update'] as const,
  mutationFn: async (patch: Patch): Promise<Todo> => ({ id: todoId, ...patch }),
  onMutate: (patch) => ({ previousTitle: patch.title }),
})
