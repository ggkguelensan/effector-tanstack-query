export const todoKeys = {
  detail: (id: number) => ['todos', 'detail', { id }] as const,
  list: (projectId: string, filters: { status: string; page: number }) =>
    ['projects', projectId, 'todos', filters] as const,
}
