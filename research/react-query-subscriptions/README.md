# Query subscription experiment

The adapter's ordinary `useQuery` subscribes to all nine result stores through `useUnit`. Reading only `data` from its return value does not narrow those subscriptions. Native React Query filters observer notifications by tracked result properties; explicit `useUnit`/`useStoreMap` subscriptions can be selective too.

No implementation changes are included. The findings are published in [issue #27](https://github.com/ilyaagarkov/effector-tanstack-query/issues/27), separately from PR18 and without prescribing a fix.

## Results

Additional committed component updates, excluding initial mount:

| Consumer | Identical background refetch | Title changes, ID unchanged | ID changes | Failed background refetch, data retained |
| --- | ---: | ---: | ---: | ---: |
| Adapter useQuery, reads data only | 2 | 1 | 1 | 2 |
| Native useQuery, reads data only | 0 | 1 | 1 | 0 |
| useUnit(query.$data) | 0 | 1 | 1 | 0 |
| useUnit(data + error) | 0 | 1 | 1 | 1 |
| Adapter/native, reads data + isFetching | 2 | 1 | 1 | 2 |
| Native, notifyOnChangeProps all | 2 | 1 | 1 | 2 |
| Native, object rest destructuring | 2 | 1 | 1 | 2 |
| Native select / useStoreMap, reads ID only | 0 | 0 | 1 | 0 |

Results match for:

- PR18 ca64fed: factory and inline, React 19.2.5 / Query 5.100.10.
- Actual pre-PR master 08c41a7: inline, same dependencies. Factory did not exist there. This is not a PR18 regression.
- PR18 with Ticketon's installed dependency profile: React 18.3.1 / Query 5.100.11, both forms. Ticketon application source is not modified or imported in this experiment.
- StrictMode on/off. Individual React Profilers count committed updates; raw render-function calls are also recorded. Development StrictMode doubles calls but does not change the committed-update comparison.

Effector 23.4.4 and effector-react 23.3.0 are used in both dependency profiles.

## Controls and limitations

All ten probe components share one client and key. Cache data is populated before subscribing. `staleTime: Infinity` prevents incidental mount fetches; retry is disabled. Controlled promises separate request start/finish. An identical payload retains the same data reference through structural sharing. Direct cache writes exercise real data and selected-field changes. There are exactly two network calls. Both adapter owners and the explicit model owner are cleaned up.

The tests assert render differences, data identity and displayed values. They do not measure render duration, browser responsiveness, production CPU cost, SSR, Suspense, mutations, or every possible option policy. Full core notifications must remain available for model correctness; this result concerns React subscription breadth.

Validation: focused 4 PR18 cases, 2 baseline inline cases, 4 Ticketon-profile cases; all pass. Existing/full suites: 198 core + 272 React checks; types pass.

## Reproduce

Run from this worktree root:

```sh
pnpm install --frozen-lockfile
QUERY_SUBSCRIPTION_REPORT_DIR="$PWD/.cache/react-query-subscriptions" pnpm --filter @effector-tanstack-query/react exec vitest run src/__tests__/querySubscriptions.experiment.test.tsx --coverage.enabled=false
QUERY_SUBSCRIPTION_REPORT_DIR="$PWD/.cache/react-query-subscriptions/master" pnpm --filter @effector-tanstack-query/react exec vitest run src/__tests__/querySubscriptions.experiment.test.tsx --config ../../research/react-query-subscriptions/master.config.ts -t inline
```

The master config loads actual source via `git show`, rather than reproducing the old hook. Its type checking is disabled because the unused factory test branch refers to a form absent on master.

To repeat using an installed external dependency profile, set `QUERY_SUBSCRIPTION_DEPENDENCY_MANIFEST` to that consumer's absolute `package.json` path. It must resolve React, React DOM, Effector, effector-react, React Query and Testing Library with consistent peers:

```sh
QUERY_SUBSCRIPTION_REPORT_DIR="$PWD/.cache/react-query-subscriptions/ticketon" pnpm --filter @effector-tanstack-query/react exec vitest run src/__tests__/querySubscriptions.experiment.test.tsx --config ../../research/react-query-subscriptions/external-dependencies.config.ts
node research/react-query-subscriptions/summarize.mjs
```

`results.json` is generated from the asserted raw reports; do not edit it independently. The summary script checks that all form/dependency/StrictMode profiles match.
