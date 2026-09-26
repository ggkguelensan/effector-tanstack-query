import { Suspense } from 'react'
import { afterEach, expect, it } from 'vitest'
import {
  act,
  cleanup,
  render,
  waitFor,
  fireEvent,
} from '@testing-library/react'
import { allSettled, createEvent, createStore, fork } from 'effector'
import { Provider } from 'effector-react'
import { QueryClient, type QueryObserver } from '@tanstack/query-core'
import * as core from '@effector-tanstack-query/core'
import * as hooks from '../index'

afterEach(cleanup)
it.each(['single', 'tuple', 'infinite'])(
  'inline %s Suspense uses scoped parameters before mount and after key changes',
  async (kind) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    })
    const changed = createEvent<number>()
    const $id = createStore(1).on(changed, (_, n) => n)
    const calls: number[] = []
    const options = {
      queryKey: ['suspense', $id],
      queryFn: async ({ queryKey, pageParam = 0 }: any) => {
        calls.push(queryKey[1])
        return queryKey[1] * 10 + pageParam
      },
    }
    const query =
      kind === 'infinite'
        ? core.createInfiniteQuery(client, {
            ...options,
            initialPageParam: 0,
            getNextPageParam: () => 1,
          })
        : core.createQuery(client, options)
    const scope = fork({ values: [[$id, 3]] })
    const queries = [query] as const
    function Page() {
      const result =
        kind === 'infinite'
          ? hooks.useSuspenseInfiniteQuery(query as any)
          : kind === 'tuple'
            ? hooks.useSuspenseQueries(queries)[0]
            : hooks.useSuspenseQuery(query)
      return (
        <>
          <span>{JSON.stringify(result.data)}</span>
          {'fetchNextPage' in result && (
            <button onClick={result.fetchNextPage as () => void}>next</button>
          )}
        </>
      )
    }
    const view = render(
      <Provider value={scope}>
        <Suspense fallback="pending">
          <Page />
        </Suspense>
      </Provider>,
    )
    await waitFor(() =>
      view.getByText(
        kind === 'infinite' ? '{"pages":[30],"pageParams":[0]}' : '30',
      ),
    )
    expect(calls).toEqual([3])
    await act(() => allSettled(changed, { scope, params: 4 }))
    await waitFor(() =>
      view.getByText(
        kind === 'infinite' ? '{"pages":[40],"pageParams":[0]}' : '40',
      ),
    )
    expect(calls).toEqual([3, 4])
    if (kind === 'infinite') {
      fireEvent.click(view.getByText('next'))
      await waitFor(() =>
        view.getByText('{"pages":[40,41],"pageParams":[0,1]}'),
      )
      expect(calls).toEqual([3, 4, 4])
    }
    view.unmount()
    expect(
      scope.getState<QueryObserver<any, any, any, any, any> | null>(
        query.$observer,
      ),
    ).toBeNull()
    client.clear()
  },
)
