# Pre-factory compatibility checks

Run `pnpm test:compat` from the workspace root. It builds the packages, then
compares them with master commit `08c41a7ce71d84c960b632ecab3b460af1557206`
(the baseline of PR #18). That commit must be present in git history; CI checks
out full history. `prepare.mjs` extracts its actual core/React sources into the
ignored `.baseline` directory. No hand-reimplemented reference model is used.

The default Query Core matrix is 5.0.0, 5.40.0, 5.80.0 and 5.100.10. Packages
are obtained with `npm pack` into a disposable temporary directory; workspace
dependencies are not rewritten. `QUERY_VERSIONS=5.0.0 pnpm test:compat` narrows
the matrix when investigating a failure.

Checks:

- Identical inline query/infinite traces: resolved defaults across key changes,
  notification filters, callback/store polling, interval becoming undefined,
  refresh, remount and unrelated extra properties on options variables.
- Legacy skipToken prefetch semantics on versions that provide skipToken.
- Single/tuple/infinite Suspense with all four old/new core/React combinations,
  scoped initial parameters, key changes, pagination and cleanup.
- Compiled inline consumer fixtures checked against both baseline and current
  declarations, including positive/negative cases and explicit generics.
- Factory/helper consumer typing and runtime on each installed core version.
- Built ESM/CJS entry-point import and execution in an isolated consumer.

## Inline invariant audit

`inline-invariants.test.ts` adds 25 scenarios. Each runs against the extracted
baseline and the PR implementation, asserts expected observable outcomes, then
compares their traces. Both query and infinite query run the shared scenarios.

| Boundary | Guarantees checked |
| --- | --- |
| Scope and client | Scoped parameters, separate observers/events, explicit-client precedence, separate-client cache isolation, shared-client cache updates and in-flight deduplication |
| SSR | `allSettled(prefetch)` awaits completion; prefetch alone fills cache, activation fills stores; JSON serialization plus Query dehydration/hydration restores state without fetching fresh data; runtime objects stay out of serialization |
| Ownership | Repeated mount shares one observer; only last owner releases it; unmatched unmount is safe; remount creates a new observer; stores stop updating after release |
| Cancellation | Consumed AbortSignal aborts obsolete key requests and last-owner requests; late responses do not overwrite current state |
| Reactive options | Combined nested key parameters, enabled and polling update coherently; disabled prefetch/refresh do not fetch; queryFn receives native context, ordinary values, meta and pageParam |
| Defaults/options | Explicit hash handling, retry callbacks, external observer options across reactive updates, and recovery from missing client match the baseline |
| Data | Initial/placeholder state, selected model data versus raw cache data, and external cache writes |
| Events | Scope-bound success/failure, mount baseline suppression, advancing timestamps, cache-write success events, notification filters, and same-millisecond suppression |
| Infinite query | Next/previous cursors, pageParams, maxPages, selection, fetching/error flags, failure recovery and pagination without an observer |

`public-types.types.ts` adds 20 equality assertions for the old public option,
result, key, helper and last-overload contracts. The existing consumer fixtures
also exercise overload calls and expected rejections. New factory overloads
remain additive.

These checks preserve existing boundaries rather than strengthen old behavior:

- Effector scope isolation does not isolate a shared QueryClient cache.
- `finished` is observer/timestamp-driven, not exactly once per network request;
  `setQueryData` can emit success and inline notification filters can suppress it.
- Cancellation scenarios consume the native signal; request cancellation follows
  TanStack's signal semantics.
- Cleanup is guaranteed after the last owner, without promising one internal
  `destroy()` call (unsubscribe may invoke it too).

Existing regression suites remain important: core `createQuery`,
`createInfiniteQuery`, `sharedLifecycle`, `abort-signal`, `prefetch`,
`prefetchQueries`, `createQuery.ssr`, `sid`, `cacheActions`, `createInvalidate`
and both `finished` suites; React `createQuery.*`, `createInfiniteQuery.*`,
`sharedLifecycle`, `suspense*`, `useSuspenseQueries`, `ssr-concurrency`,
`compat*` and `hydrationBoundary`. They cover UI subscriptions, focus/reconnect,
network modes, retries, cache actions and hydration in addition to the explicit
old/new comparisons. `createQueries`, mutation and global-counter suites remain
in the full regression gate even though those APIs are outside this change.

The declaration fixtures use the repository's existing `skipLibCheck: true`.
This is a consumer compatibility check, not a claim that all pre-existing
upstream declaration issues are fixed. On Query 5.0/5.40 the baseline already
loses the inline infinite queryFn pageParam type; a dedicated fixture asserts
that the inferred type and diagnostic remain identical after this PR.

The ordinary `pnpm test` / `pnpm test:types` suites remain separate gates. No
finite matrix proves equivalence for every possible program; add a differential
case here when a further old-contract boundary is identified.
