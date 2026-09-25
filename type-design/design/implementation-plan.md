## PR #18: implementation sequence and regression gates

This is the plan for the revised source + query target in #17, not a description of the old createQueryFromOptions diff. Preserve the original author's proposal at https://github.com/ilyaagarkov/effector-tanstack-query/pull/18#issuecomment-5817971547 as context. The design records distinguish verified findings from proposals.

### Commit sequence

1. **Core helpers and type foundation.** Add pinned/adapted queryOptions and infiniteQueryOptions with MIT attribution, core-only imports, native overload/tag behavior, and a verified dependency floor. Include the minimal registered-key compatibility repair needed to consume already-typed apps. Establish positive and negative contracts before runtime work.
2. **Normalize existing query execution.** Converge inline options into a current scoped options representation. Preserve lifecycle and behavior; read resolved options in mount/update/prefetch and internal pre-mount observer creation. Apply adapter-owned option policies without mutating factory/default objects or retaining obsolete fields by spreading observer.options.
3. **createQuery factory overloads/runtime.** Add store/shape source resolution and full option updates with explicit/default client parity. Support native callback enabled and defined top-level overrides. Preserve old inline generic calls and reject mixed forms.
4. **createInfiniteQuery parity.** Preserve page parameters, page accumulation/cursors, selectors, prefetch and existing lifecycle. Do not turn upstream unknown pageParams into a falsely precise public guarantee.
5. **Consumer scenarios and docs.** Show the same definition consumed by QueryClient, Effector, and native consumers; document framework-agnostic responsibilities, lifecycle/scope, notification normalization, and inference workarounds. Update query/infinite API docs, add helper docs and changelog. Run the required repository gates on the final implementation.

Each behavior/type change carries its own meaningful tests. Tests/docs are not deferred to one large final cleanup commit.

### New invariant checks

| Area | Required coverage |
| --- | --- |
| Source resolution | Single store/shape, plain values, scope-local values, coherent updates when several fields change in one graph transaction |
| Complete options | Source-dependent key/queryFn/options; same-key selector changes; removal/undefined of previously supplied options must not preserve stale observer fields |
| Overrides | Top-level enabled true/false overrides factory boolean/callback; undefined inherits; interval number/false/callback/store behavior remains coherent |
| Disabled/skipToken | Factory still resolves; no nullable narrowing promise; native skipToken/refetch distinctions are retained |
| QueryClient | Explicit versus per-scope client; typed factories shared with imperative cache calls; raw cache data versus selected observer data |
| Prefetch/SSR | allSettled waits for operations and uses current scoped params/options; hydration/serialize behavior and existing no-client Suspense fallback remain correct |
| Lifecycle | Shared consumers/refcounts, mount/unmount/remount, no duplicate subscriptions, query cancellation/signal, scope isolation |
| Notifications | Pending/fetching/error and finished events cannot be suppressed by a factory/default notifyOnChangeProps filter; same-data successful refetch remains observable where the contract requires it |
| Infinite | Initial/next/previous page params, selector/raw distinction, option updates, page accumulation and prefetch parity |
| Types | Native/local helpers, plain objects, selected data, errors/defaults, registered keys, initialData/skipToken, both client overloads, mixed-form rejection including variables/spreads |

For callback enabled, a store of a boolean or callback is not itself the resolved enabled state. Native callback evaluation depends on the Query; do not implement prefetch/Suspense gates by coercing the callback to boolean.

### Existing suites to protect

- Core and React `sharedLifecycle` tests, including the refcount fix from #19 / #20, mixed consumers and StrictMode.
- Core createQuery/type tests: legacy generics, reactive keys/enabled/interval, cache/dedup and selection.
- Core prefetch/prefetchQueries/SSR and QueryClient tests: allSettled, hydration, serialize, scoped versus explicit clients.
- React SSR concurrency, suspense-SSR, Suspense queries/infinite/families and the no-client behavior fixed in #15 / #16.
- Core finished-event tests for queries and infinite queries: actual completions, no false events from hydration/selection-only changes.
- Advanced option pass-through and refetch tests: custom hashes, callback intervals, retry and initial/placeholder data.
- AbortSignal/cancellation tests from the existing suite.
- Existing createQueries/React family tests if shared types or observer utilities change.
- Mutation tests if helpers or shared type changes touch them; mutation runtime expansion is #22, not #18.

Use the current master suites, not the counts reported by the old PR diff. The type-only prototype is additional evidence and does not replace runtime regressions.

### Final repository gates

- [ ] Relevant focused tests while implementing each step.
- [ ] `pnpm test`
- [ ] `pnpm test:types`
- [ ] `pnpm build`
- [ ] `pnpm check:publish`
- [ ] Docs build using the workspace's docs command.
- [ ] Supported TypeScript / TanStack dependency-floor compatibility checks and applicable existing CI matrix.

### Follow-up PR boundaries

- #21 fixes the existing onMutate-result typing loss across core/React.
- #22 introduces mutation factories after its typing prerequisite, with an explicit execution snapshot policy.
- #23 aligns the existing createQueries factory consumer.
- #24 adds consumer-level select if adopted after its type/precedence cases are solved.
- #25 adds family combine after the family contract is established.

No top-level select, combine, dedicated third creation function, or new UI-framework package is required to complete #17.
