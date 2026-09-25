import * as React from 'react'
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
import { QueryClient } from '@tanstack/query-core'
import * as oldCore from '@baseline/core'
import * as oldReact from '@baseline/react'
import * as newCore from '../../packages/core/src/index'
import * as newReact from '../../packages/react/src/index'

afterEach(cleanup)
const versions = [
  { name: 'old core / old React', core: oldCore, hooks: oldReact },
  { name: 'old core / new React', core: oldCore, hooks: newReact },
  { name: 'new core / old React', core: newCore, hooks: oldReact },
  { name: 'new core / new React', core: newCore, hooks: newReact },
]
for (const { name, core, hooks } of versions) {
  it.each(['single', 'tuple', 'infinite'])(
    `${name}: inline %s Suspense and scoped key updates`,
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
      const queries = [query]
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
              <button onClick={result.fetchNextPage}>next</button>
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
      expect(scope.getState(query.$observer)).toBeNull()
      client.clear()
    },
  )
}
