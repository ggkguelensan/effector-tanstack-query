import type { MutateOptions } from '@tanstack/query-core'
import type { UseMutationResult } from '../packages/react/src/index'
import type { MutationFactoryResult } from './contracts'

// The rollback-context fix must extend core and React declarations together.
export type UseMutationResultWithContext<D, E, V, C> = Omit<UseMutationResult<D, E, V>, 'mutateWith'> & {
  mutateWith: (args: { variables: V } & Pick<MutateOptions<D, E, V, C>, 'onSuccess' | 'onError' | 'onSettled'>) => void
}

export declare function useMutation<D = unknown, E = Error, V = void, C = unknown>(
  mutation: MutationFactoryResult<D, E, V, C>,
): UseMutationResultWithContext<D, E, V, C>
