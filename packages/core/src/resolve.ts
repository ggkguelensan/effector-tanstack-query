import { combine, createStore, is } from 'effector'
import type { Store } from 'effector'
import type { QueryKey } from '@tanstack/query-core'
import type { EffectorQueryKey, StoreOrValue } from './types'

const LIB = '[@tanstack/query-effector]'

/**
 * Names an effector unit for error messages: `'Store'` | `'Event'` |
 * `'Effect'`, with a generic `'unit'` fallback for anything else `is.unit`
 * accepts (domain/scope — never valid in a key).
 */
function unitKind(value: unknown): string {
  if (is.store(value)) return 'Store'
  if (is.effect(value)) return 'Effect'
  if (is.event(value)) return 'Event'
  return 'unit'
}

/**
 * Reject *every* effector unit found in a queryKey, including a top-level
 * `Store` — the walker underlying the `createQueries` DEV diagnostic.
 *
 * `resolveKey` tolerates a top-level `Store` (it unwraps it before hashing),
 * but `createQueries` builds its per-item key at runtime and hashes it as-is,
 * never unwrapping — so there a top-level `Store` crashes `hashKey` exactly
 * like a nested one and must be flagged too. Delegates to
 * {@link scanForNestedUnit} for the actual (cheap, cycle-safe) walk and shares
 * its path-naming error.
 */
export function assertNoUnitsInKey(key: ReadonlyArray<unknown>): void {
  const seen = new WeakSet<object>()
  key.forEach((element, i) =>
    scanForNestedUnit(element, `queryKey[${i}]`, seen),
  )
}

/**
 * Depth-first scan of one queryKey element. Throws on the first effector unit
 * it finds — top-level or nested — naming its path; otherwise returns.
 *
 * Why any unit in a hashed key is a bug: a `Store` is a *cyclic object*, so
 * TanStack's `hashKey` (`JSON.stringify` with a key-sorting replacer) throws
 * "Converting circular structure to JSON" deep inside the mount effect — a
 * rejection swallowed by `allSettled`, leaving the query silently pending
 * forever. An `Event`/`Effect` is a callable *function*, silently dropped by
 * `JSON.stringify` to a degenerate hash that collides across distinct keys.
 * Both are worse than a clear error. The one exception is a *top-level* `Store`,
 * which `resolveKey` unwraps before hashing — so `resolveKey` skips is.store
 * elements before calling this, while `assertNoUnitsInKey` (createQueries) does
 * not. Every other placement throws.
 *
 * `is.unit` is checked before the object gate because Events/Effects are
 * callable *functions* — a `typeof 'object'` check would skip straight past
 * them. A `WeakSet` guards against cyclic plain objects; no depth cap needed.
 */
function scanForNestedUnit(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): void {
  if (is.unit(value)) {
    throw new Error(
      `${LIB} ${path} is an effector ${unitKind(value)}. A queryKey may not ` +
        `contain an effector unit here: a Store crashes hashKey ("Converting ` +
        `circular structure to JSON"), while an Event/Effect is dropped by ` +
        `JSON.stringify to a degenerate hash that collides across distinct keys. ` +
        `Derive a plain value with combine/map before building the key — a reactive ` +
        `dimension belongs in a top-level Store element (e.g. ['todos', $page]).`,
    )
  }
  // Only plain objects/arrays are worth recursing into.
  if (value === null || typeof value !== 'object') return
  // Cycle guard — a self-referential plain object must not hang the walk.
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item, i) => scanForNestedUnit(item, `${path}[${i}]`, seen))
    return
  }
  // Own enumerable values only — matches the shape TanStack's hashKey walks.
  for (const [k, v] of Object.entries(value)) {
    scanForNestedUnit(v, `${path}.${k}`, seen)
  }
}

export function resolveKey(key: EffectorQueryKey): Store<QueryKey> {
  const storePositions: Array<number> = []
  const stores: Array<Store<unknown>> = []

  // Single pass: collect top-level stores (the supported reactive form,
  // unwrapped below before the key is ever hashed) and fail fast on any other
  // unit placement — a top-level Event/Effect, or any unit nested inside a
  // plain object/array element, crashes or silently mis-hashes hashKey (see
  // scanForNestedUnit), so reject it at factory-creation time naming the path.
  // Every consumer (createQuery, createInfiniteQuery, createInvalidate,
  // createCancel/Remove/Reset) routes through here.
  const seen = new WeakSet<object>()
  key.forEach((item, i) => {
    if (is.store(item)) {
      storePositions.push(i)
      stores.push(item as Store<unknown>)
      return
    }
    scanForNestedUnit(item, `queryKey[${i}]`, seen)
  })

  if (stores.length === 0) {
    return createStore(key as QueryKey)
  }

  return combine(stores).map((values) =>
    key.map((item, i) => {
      const storeIdx = storePositions.indexOf(i)
      return storeIdx >= 0 ? values[storeIdx] : item
    }),
  ) as Store<QueryKey>
}

export function resolveEnabled(
  enabled: StoreOrValue<boolean> | undefined,
): Store<boolean> {
  if (is.store(enabled)) return enabled
  return createStore(enabled ?? true)
}

/**
 * `refetchInterval` accepts a static value, a function `(query) => …`, or an
 * effector `Store<number | false>`. Only the Store form is "reactive" — the
 * function form is evaluated by the observer on every tick and stays in the
 * observer's options. Returns the store if one was passed, `undefined`
 * otherwise (signaling the per-flavor factory to keep the value in
 * `restOptions` for the observer constructor).
 */
export function resolveReactiveRefetchInterval(
  value: unknown,
): Store<number | false | undefined> | undefined {
  return is.store(value)
    ? (value as Store<number | false | undefined>)
    : undefined
}
