# PR18 review readiness

Checked on 2026-10-08 at upstream PR18 head `ca64fedd309a271de044ee41428b2c16a6bc1b9d`, against base `08c41a7ce71d84c960b632ecab3b460af1557206`. This report is outside PR18.

Ready to request maintainer code review. This does not mean CI is green or the PR is ready to merge.

## Scope

The latest Ilya decisions are reflected: existing createQuery/createInfiniteQuery factory forms, core options helpers with attribution, full scoped prefetch/Suspense options, boolean enabled, only name/enabled/refetchInterval at the factory top level, defined queryKey precedence, unchanged peer ranges, one Suspense runtime protocol, focused interoperability tests and the specified documentation pages. CHANGELOG, createMutation, createQueries, lockfile and workflow files have no diff against the base. Compatibility infrastructure and all later experiments remain outside PR18.

No new review comments or formal reviews were present when checked. No additional functional blocker was found. Existing internal assertions and documented nested-composition inference limits remain; this is not a complete type-system rewrite. Optional duplicate-test/docs reductions are not prerequisites for asking for review. The 58-commit history is long; evaluate the final diff, without rewriting public history as part of this readiness check.

## Fresh local validation

Node 25.8.1, unchanged installed dependencies:

- pnpm test: 198 core + 268 React checks passed.
- pnpm test:types: passed, including Register and generated ESM/CommonJS declaration consumers.
- pnpm build and pnpm check:publish: passed.
- Docs build: 33 pages passed.
- CSR example build and Next.js SSR production build: passed.
- git diff --check: passed; PR worktree clean; local and remote head match.

These checks are local and do not replace GitHub's Node 22/24 and React/Next matrix.

## Remote CI

Both current-head pull_request runs have conclusion `action_required` and no jobs started. They need maintainer approval:

- [CI](https://github.com/ilyaagarkov/effector-tanstack-query/actions/runs/37712813110)
- [Existing React/Next compat matrix](https://github.com/ilyaagarkov/effector-tanstack-query/actions/runs/37712812951)

The existing compat workflow is inherited from the base; it is not the separate query-core compatibility infrastructure Ilya asked to move out.

## Proposed short comment — not posted

> @ilyaagarkov, PR18 is ready for review within the agreed scope. Factory forms, core helpers and scoped prefetch/Suspense are covered; inline behavior and dependency ranges are preserved. Local tests, types, builds, publish checks, docs and both examples pass. GitHub workflows are awaiting maintainer approval. Please look closely at inline option preservation and factory options before Suspense mount. Follow-ups remain separate.

No review request or GitHub comment was sent by this check.
