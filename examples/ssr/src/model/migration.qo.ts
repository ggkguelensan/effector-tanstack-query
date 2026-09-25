import { queryOptions } from '@effector-tanstack-query/core'
import { fetchPokemonList } from './api'

// Plain values and portable options: native hooks, QueryClient and Effector
// consume this same definition.
export const migrationListOptions = () =>
  queryOptions({
    queryKey: ['migration-list'] as const,
    queryFn: () => fetchPokemonList(10, 0),
    staleTime: 60_000,
  })
