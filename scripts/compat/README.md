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

The declaration fixtures use the repository's existing `skipLibCheck: true`.
This is a consumer compatibility check, not a claim that all pre-existing
upstream declaration issues are fixed. On Query 5.0/5.40 the baseline already
loses the inline infinite queryFn pageParam type; a dedicated fixture asserts
that the inferred type and diagnostic remain identical after this PR.

The ordinary `pnpm test` / `pnpm test:types` suites remain separate gates. No
finite matrix proves equivalence for every possible program; add a differential
case here when a further old-contract boundary is identified.
