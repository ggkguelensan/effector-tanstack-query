// No Effector, TanStack, spread, overloads, or source inference involved.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false
declare function exact<T extends true>(): void

type Options<Raw, Selected> = {
  value: Raw
  select: (data: Raw) => Selected
}
declare function nested<Raw, Selected>(
  query: (id: number) => Options<Raw, Selected>,
): Selected
declare function direct<Raw, Selected>(options: Options<Raw, Selected>): Selected

export const failing = nested(id => ({
  value: { id, title: 'todo' },
  select: todo => {
    exact<Equal<typeof todo, unknown>>()
    // @ts-expect-error Contextual raw data is unknown in the nested callback.
    return todo.title
  },
}))

export const annotated = nested((id: number) => ({
  value: { id, title: 'todo' },
  select: todo => {
    exact<Equal<typeof todo, { id: number; title: string }>>()
    // @ts-expect-error Not an any-based workaround.
    todo.nonexistent
    return todo.title
  },
}))
exact<Equal<typeof annotated, string>>()

export const noParameter = nested(() => ({
  value: { id: 1, title: 'todo' },
  select: todo => {
    exact<Equal<typeof todo, { id: number; title: string }>>()
    return todo.title
  },
}))
exact<Equal<typeof noParameter, string>>()

export const directObject = direct({
  value: { id: 1, title: 'todo' },
  select: todo => {
    exact<Equal<typeof todo, { id: number; title: string }>>()
    return todo.title
  },
})
exact<Equal<typeof directObject, string>>()

export const helper = nested(id => directOptions({
  value: { id, title: 'todo' },
  select: todo => {
    exact<Equal<typeof todo, { id: number; title: string }>>()
    return todo.title
  },
}))
declare function directOptions<Raw, Selected>(options: Options<Raw, Selected>): Options<Raw, Selected>
exact<Equal<typeof helper, string>>()
