import type { Store } from 'effector'
import type {
  FetchStatus,
  QueryClient,
  QueryStatus,
} from '@tanstack/query-core'
import type { ResolvedOptions } from './resolve'

interface SnapshotState {
  data: unknown
  error: unknown
  status: QueryStatus
  isFetching: boolean
  isPlaceholderData: boolean
  fetchStatus: FetchStatus
}

export type SuspenseSnapshot = SnapshotState &
  (
    | { kind: 'query' }
    | {
        kind: 'infinite'
        hasNextPage: boolean
        hasPreviousPage: boolean
        isFetchingNextPage: boolean
        isFetchingPreviousPage: boolean
        isFetchNextPageError: boolean
        isFetchPreviousPageError: boolean
      }
  )

export interface SuspenseReader {
  read(): SuspenseSnapshot
  fetch(): Promise<unknown>
  subscribe(listener: () => void): () => void
}

export interface QueryInternals {
  $options: Store<ResolvedOptions>
  $reader: Store<SuspenseReader | null>
  createReader(client: QueryClient, options: ResolvedOptions): SuspenseReader
}

// Symbol.for keeps the protocol available across ESM/CJS and duplicate copies.
const queryInternalsKey = Symbol.for(
  '@effector-tanstack-query/core/query-internals/v1',
)

interface QueryInternalsHost {
  $queryClient: Store<QueryClient | null>
  [queryInternalsKey]?: QueryInternals
}

export function attachQueryInternals(
  model: QueryInternalsHost,
  value: QueryInternals,
): void {
  model[queryInternalsKey] = value
  Object.defineProperty(model, queryInternalsKey, {
    enumerable: false,
    writable: false,
    configurable: false,
  })
}

export function getQueryInternals(model: QueryInternalsHost): QueryInternals {
  const value = model[queryInternalsKey]
  if (!value) {
    throw new Error(
      '[@effector-tanstack-query/core] Query internals are unavailable.',
    )
  }
  return value
}
