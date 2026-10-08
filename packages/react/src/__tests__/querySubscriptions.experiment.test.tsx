import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Profiler, StrictMode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { Provider, useStoreMap, useUnit } from 'effector-react'
import { allSettled, fork } from 'effector'
import { QueryClient } from '@tanstack/query-core'
import { QueryClientProvider, queryOptions, useQuery as useNativeQuery } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createQuery } from '@effector-tanstack-query/core'
import { useQuery as useAdapterQuery } from '../index'

type Data = { id: number; title: string }
const names = ['adapterData', 'nativeData', 'storeData', 'storeDataError', 'adapterFetching', 'nativeFetching', 'nativeAll', 'nativeRest', 'nativeSelectedId', 'storeSelectedId'] as const
type Name = typeof names[number]
const blank = (): Record<Name, number> => Object.fromEntries(names.map(name => [name, 0])) as Record<Name, number>
const selectId = (data: Data) => data.id
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })

for (const form of ['factory', 'inline'] as const) {
  for (const strictMode of [false, true]) {
  describe(`${form}, strictMode=${strictMode}: observed fields and component renders`, () => {
    it('compares background refetch, data changes and error notifications', async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
      let resolveRequest: (value: Data) => void = () => { throw new Error('No pending request') }
      let rejectRequest: (error: Error) => void = () => { throw new Error('No pending request') }
      const fetch = vi.fn(() => new Promise<Data>((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject }))
      const key = ['subscription-probe', form]
      const options = queryOptions({ queryKey: key, queryFn: fetch, staleTime: Infinity })
      client.setQueryData(options.queryKey, { id: 1, title: 'first' })
      const query = form === 'factory'
        ? createQuery<Data, Error, Data, typeof key>(client, { name: `probe-${form}`, source: {}, query: () => options })
        : createQuery<Data, Error, Data, typeof key>(client, { name: `probe-${form}`, queryKey: key, queryFn: fetch, staleTime: Infinity })
      const scope = fork()
      await allSettled(query.mounted, { scope })
      const renders = blank()
      const commits = blank()
      function AdapterData() {
        renders.adapterData++
        const { data } = useAdapterQuery(query)
        return <span data-testid="adapterData">{data?.title}</span>
      }
      function NativeData() {
        renders.nativeData++
        const { data } = useNativeQuery(options)
        return <span data-testid="nativeData">{data?.title}</span>
      }
      function StoreData() {
        renders.storeData++
        const data = useUnit(query.$data)
        return <span data-testid="storeData">{data?.title}</span>
      }
      function StoreDataError() {
        renders.storeDataError++
        const { data, error } = useUnit({ data: query.$data, error: query.$error })
        return <span>{data?.title}/{error?.message}</span>
      }
      function AdapterFetching() {
        renders.adapterFetching++
        const { data, isFetching } = useAdapterQuery(query)
        return <span>{data?.title}/{String(isFetching)}</span>
      }
      function NativeFetching() {
        renders.nativeFetching++
        const { data, isFetching } = useNativeQuery(options)
        return <span>{data?.title}/{String(isFetching)}</span>
      }
      function NativeAll() {
        renders.nativeAll++
        const { data } = useNativeQuery({ ...options, notifyOnChangeProps: 'all' })
        return <span>{data?.title}</span>
      }
      function NativeRest() {
        renders.nativeRest++
        const { data, ...rest } = useNativeQuery(options)
        void rest
        return <span>{data?.title}</span>
      }
      function NativeSelectedId() {
        renders.nativeSelectedId++
        const { data } = useNativeQuery({ ...options, select: selectId })
        return <span>{data}</span>
      }
      function StoreSelectedId() {
        renders.storeSelectedId++
        const id = useStoreMap({ store: query.$data, keys: [], fn: data => data?.id })
        return <span>{id}</span>
      }
      const probes = [<AdapterData />, <NativeData />, <StoreData />, <StoreDataError />,
        <AdapterFetching />, <NativeFetching />, <NativeAll />, <NativeRest />,
        <NativeSelectedId />, <StoreSelectedId />]
      const children = names.map((name, index) => <Profiler key={name} id={name}
        onRender={() => { commits[name]++ }}>{probes[index]}</Profiler>)
      const view = render(<Provider value={scope}><QueryClientProvider client={client}>
        {strictMode ? <StrictMode>{children}</StrictMode> : children}
      </QueryClientProvider></Provider>)
      const phases: Record<string, Record<Name, number>> = {}
      const renderPasses: Record<string, Record<Name, number>> = {}
      let previous = blank()
      let previousRenders = blank()
      function capture(phase: string) {
        phases[phase] = Object.fromEntries(names.map(name => [name, commits[name] - previous[name]])) as Record<Name, number>
        renderPasses[phase] = Object.fromEntries(names.map(name => [name, renders[name] - previousRenders[name]])) as Record<Name, number>
        previous = { ...commits }
        previousRenders = { ...renders }
      }
      function countsFor(phase: string) {
        const counts = phases[phase]
        if (!counts) throw new Error(`Missing phase: ${phase}`)
        return counts
      }
      async function beginRefetch() {
        let pending = Promise.resolve()
        act(() => { pending = client.refetchQueries({ queryKey: options.queryKey, exact: true }) })
        await flush()
        // Keep the pending promise out of the async return value.
        return { pending }
      }
      try {
        await flush()
        expect(fetch).not.toHaveBeenCalled()
        capture('initial')
        const firstData = scope.getState(query.$data)
        const first = await beginRefetch()
        capture('sameData:start')
        await act(async () => { resolveRequest({ id: 1, title: 'first' }); await first.pending })
        await flush()
        expect(scope.getState(query.$data)).toBe(firstData)
        capture('sameData:finish')
        act(() => { client.setQueryData(options.queryKey, { id: 1, title: 'changed' }) })
        await flush()
        capture('titleChanged')
        expect(view.getByTestId('nativeData').textContent).toBe('changed')
        expect(view.getByTestId('adapterData').textContent).toBe('changed')
        act(() => { client.setQueryData(options.queryKey, { id: 2, title: 'changed' }) })
        await flush()
        capture('idChanged')
        const failed = await beginRefetch()
        capture('error:start')
        await act(async () => { rejectRequest(new Error('probe error')); await failed.pending })
        await flush()
        capture('error:finish')
        expect(scope.getState(query.$data)?.title).toBe('changed')
        expect(scope.getState(query.$error)?.message).toBe('probe error')
        for (const phase of ['sameData:start', 'sameData:finish', 'error:start', 'error:finish']) {
          expect(countsFor(phase).adapterData).toBe(1)
          expect(countsFor(phase).nativeData).toBe(0)
          expect(countsFor(phase).storeData).toBe(0)
          expect(countsFor(phase).adapterFetching).toBe(1)
          expect(countsFor(phase).nativeFetching).toBe(1)
          expect(countsFor(phase).nativeAll).toBe(1)
          expect(countsFor(phase).nativeRest).toBe(1)
        }
        expect(countsFor('sameData:start').storeDataError).toBe(0)
        expect(countsFor('sameData:finish').storeDataError).toBe(0)
        expect(countsFor('error:finish').storeDataError).toBe(1)
        expect(countsFor('titleChanged').adapterData).toBe(1)
        expect(countsFor('titleChanged').nativeData).toBe(1)
        expect(countsFor('titleChanged').storeData).toBe(1)
        for (const phase of Object.keys(phases).filter(phase => phase !== 'initial' && phase !== 'idChanged')) {
          expect(countsFor(phase).nativeSelectedId).toBe(0)
          expect(countsFor(phase).storeSelectedId).toBe(0)
        }
        expect(countsFor('idChanged').nativeSelectedId).toBe(1)
        expect(countsFor('idChanged').storeSelectedId).toBe(1)
        expect(fetch).toHaveBeenCalledTimes(2)
        const directory = process.env.QUERY_SUBSCRIPTION_REPORT_DIR
        if (directory) {
          mkdirSync(directory, { recursive: true })
          writeFileSync(join(directory, `${form}-${strictMode ? 'strict' : 'normal'}.json`),
            JSON.stringify({ form, strictMode, committedRenders: phases, renderPasses }, null, 2) + '\n')
        }
      } finally {
        view.unmount()
        await allSettled(query.unmounted, { scope })
        expect(scope.getState(query.$observer)).toBeNull()
        cleanup()
        client.clear()
      }
    })
  })
}
}
