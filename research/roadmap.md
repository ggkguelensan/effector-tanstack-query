# Deferred integration roadmap

Recorded on 2026-10-08. This is a planning record, not a request to expand upstream PR18.

## Direction

Keep TanStack Query's native React, Router/Start and SSR integrations. Effector coordinates business processes and observes the same QueryClient cache. Portable options factories remain the shared definitions; server-state cache ownership stays with TanStack.

Use native React hooks for UI query state unless a component explicitly needs Effector model stores. Do not migrate solely to replace the native API. Distinguish observing a query from initiating an operation.

Current PR18 readiness is recorded in [the review-readiness report](./pr18-review-readiness.md).

## Order

1. PR18 final verification is complete and [the review-ready comment tagging Ilya is posted](https://github.com/ilyaagarkov/effector-tanstack-query/pull/18#issuecomment-6051854941). Await maintainer CI approval and review, then handle feedback. Formal reviewer assignment was denied by GitHub repository permissions. Do not mix the work below into PR18.
2. [Subscription issue #27](https://github.com/ilyaagarkov/effector-tanstack-query/issues/27) is published at the user's request. It includes the minimal identical-background-refetch reproduction, committed-render comparison and selective useUnit control. Discuss the solution after PR18; Proxy tracking is not prescribed as the only fix.
3. Experiment with passive observation. Native hook/loader fetches; Effector observes cache updates. Start with existing enabled:false before inventing an API. Check cache writes, invalidation, parameter changes, error/data projections, scopes, cleanup and SSR/client ownership. Decide whether the result needs documentation or an API issue.
4. Validate one Ticketon vertical slice: an existing options factory, one shared QueryClient, native React consumption and one Effector business reaction. Preserve explicit parameter ownership. Assess existing Gate composition before adding createQueryGate; a shared Gate does not provide independent props for several owners.
5. Investigate awaited mutation execution and factory reuse. Current mutate is fire-and-forget and allSettled does not await its network completion. Coordinate any proposal with #21/#22 and check concurrent calls, lifecycle and callback behavior.

Existing follow-ups #21–#26 remain deferred until PR18 is merged and are considered individually. #26 already covers native-consumer interoperability, QueryClient/scopes and Router/Start SSR examples; avoid duplicating it.

## Retained experiments

- [Selective React subscriptions](https://github.com/ggkguelensan/effector-tanstack-query/tree/experiment/react-query-subscriptions/research/react-query-subscriptions): confirmed existing adapter limitation, also present before PR18. The findings are published in [issue #27](https://github.com/ilyaagarkov/effector-tanstack-query/issues/27).
- [One scoped observer-result event](https://github.com/ggkguelensan/effector-tanstack-query/tree/experiment/observer-result-bridge/research/observer-runtime): explicitly retain for later. Reduces boilerplate/bundle, but changes per-field event ordering into coherent snapshot transactions. Public stores/SIDs are preserved; acceptance of that semantic change must be explicit.
- [QueriesObserver](https://github.com/ggkguelensan/effector-tanstack-query/tree/experiment/queries-observer/research/observer-runtime): rejected as a size optimization; transitive Query Core footprint grows, duplicate-key semantics change and type checking fails.
- [Combined React useUnit shape](https://github.com/ggkguelensan/effector-tanstack-query/tree/experiment/react-unit-shapes/research/observer-runtime): fewer hook calls, no bundle reduction. Runtime speedup was not measured.

The broader type-system work remains separate from PR18. No redesign of the public React adapter, passive observation API, Gate helper or snapshot bridge is authorized for inclusion in PR18 by this plan.
