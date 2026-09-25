import type { CreateInfiniteQueryOptions } from '@subject/core'
// Older TanStack v5 used an extra InfiniteQueryObserver generic. Compare the
// baseline's inferred public type: preserve, rather than hide, existing limits.
type Options = CreateInfiniteQueryOptions<number, Error, number>
type Fetch = Extract<NonNullable<Options['queryFn']>, (...args: any[]) => any>
declare const pageParam: Parameters<Fetch>[0]['pageParam']
const page: number = pageParam
void page
