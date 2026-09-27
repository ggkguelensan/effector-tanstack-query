# Suspense internal contract experiment

Status: preserved for separate review; excluded from PR #18.

Base: `3e0242e` on `codex/factory-implementation`.

## Motivation

React accesses core's hidden `__options` and `__createObserver` fields through
double assertions. Moving those assertions into an accessor did not establish
a checked contract and was reverted before this experiment.

The useful direction is to check the contract where core creates it, then let
React consume the same interface without asserting hidden properties exist.

## Preserved prototype

- `queryInternals.ts` defines a shared contract and a query/infinite snapshot ADT.
- Core attaches the contract through a typed, non-enumerable `Symbol.for` field.
- `core/internal` exposes the accessor and protocol types to framework adapters.
- A derived `$reader` follows the scope's observer. A transient reader supports
  rendering before mount. Readers expose `read`, `fetch`, and `subscribe`.
- Single, infinite, and tuple Suspense hooks consume readers. The query-family
  implementation is outside this experiment.
- Public query result types and hook signatures remain unchanged.

The first prototype used a module-local `WeakMap`. A built-package experiment
confirmed that an ESM-created model could not be found through the CJS registry.
The preserved symbol implementation passed that scenario and a duplicate-copy
scenario. The abandoned WeakMap implementation is not retained in this branch.

## Checks performed

- 203 core tests and 266 React tests passed.
- Core and React type checks, declaration builds, and registered-type consumer
  checks passed. New type tests reject incomplete readers and snapshots and
  prevent callers from choosing an arbitrary observer type at lookup.
- Package builds, publint, and attw passed, including the new internal subpath.
- 34 targeted core tests passed with Query Core 5.0.0.
- Built-package checks passed for ESM to ESM, CJS to CJS, ESM to CJS, CJS to ESM,
  and a duplicate core copy consumed through the original internal entry point.
- Scope isolation, reader exclusion from serialized state, and unmount behavior
  are covered by the added runtime tests.

These checks describe the tested scenarios, not a proof of complete compatibility.

## Limitations and decision

The prototype adds a protocol, a derived store, a package subpath, and build
configuration to address a much narrower typing concern. Snapshot data and
errors are deliberately `unknown`; the protocol does not recover model generics.
Core still asserts native observer options to the argument type expected by
`getOptimisticResult`: TanStack's public options property does not express all
defaulted fields, and the infinite observer inherits a type without pagination
fields. Existing public `$observer` typing assertions are also unchanged.

This is a Suspense refactor, not a prerequisite for options-factory support.
Keep it out of PR #18. Before adopting a new protocol, investigate a smaller
shared contract around the existing `__options` and `__createObserver` fields,
checked at creation and read through optional internal properties with an
existence check. That smaller alternative has not been implemented or verified.
