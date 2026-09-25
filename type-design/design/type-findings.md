## Type-design investigation and evidence before implementation

Baseline: master `08c41a7`, installed TanStack Query **5.100.10**. The artifacts are declaration prototypes, projected fixes, and probes; they are not the runtime implementation of #17 or evidence that the old #18 diff satisfies the new target.

### 1. Nested spread + select inference

Directly passing a ready-made factory works in the prototype. This composition does not retain the selector input type in the tested declarations:

```ts
createQuery({
  source: $todoId,
  query: todoId => ({
    ...todoOptions({ todoId }),
    select: todo => todo.title, // todo inferred as unknown
  }),
})
```

The problem reduces to a declaration with no Effector, TanStack, source inference, overloads, or spread:

```ts
declare function nested<Raw, Selected>(query: (id: number) => {
  value: Raw
  select: (data: Raw) => Selected
}): Selected

nested(id => ({
  value: { id, title: 'todo' },
  select: todo => todo.title, // unknown
}))
```

Annotating the outer parameter `(id: number)` restores inference. A direct object argument, a no-parameter outer function, and an options helper are positive controls. The minimal reproduction and its exact-type/negative checks show the same behavior in **TS 5.7.3, 5.9.3, 6.0.3, and 7.0.2**. This is not a claim that the whole package has been tested on TS 6/7.

The declaration search covered NoInfer, fixed source types, captured options/ReturnType, signature intersections/unions, generic callback/rest parameters, mapped/reverse-mapped forms, and key DataTag inference. No safe solution to the original call shape was found. An any-based negative control was rejected by the assertions.

Compiler-source inspection and tracing a separate copy of TS 5.9.3 explain the ordinary signature's failure: an unannotated outer parameter makes the function context-sensitive; its return-body inference is initially deferred. Raw can then be fixed before the nested selector is checked, with no candidates. An annotated outer parameter permits earlier return-body inference.

```text
nested(id => ...)           Raw candidates: []
nested((id: number) => ...) Raw candidates: [{ id: number; title: string }]
nested(() => ...)           Raw candidates: [{ id: number; title: string }]
```

This establishes a compiler limitation for the tested declaration families, **not a universal proof that every possible TypeScript signature must fail**.

References: [TS #47599](https://github.com/microsoft/TypeScript/issues/47599), [TS #48538](https://github.com/microsoft/TypeScript/pull/48538), [v5.9.3 checker](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/compiler/checker.ts).

### Working composition paths

```ts
// Preferred basic consumption: no extra wrapper.
query: todoOptions

// Standard helper creates a separate inference boundary for composition.
query: todoId => queryOptions({
  ...todoOptions({ todoId }),
  select: todo => todo.title,
})

// Verified for the query declaration; not a universal mutation workaround.
query: (todoId: number) => ({
  ...todoOptions({ todoId }),
  select: todo => todo.title,
})

// A portable, separately typed selector also works.
const selectTitle = (todo: Todo) => todo.title
// query: todoId => ({ ...todoOptions({ todoId }), select: selectTitle })
```

Helpers are optional for consuming an already-typed factory. A raw object remains a supported return value, but arbitrary nested callbacks cannot be promised automatic contextual types. The same risk concerns placeholderData, infinite-page callbacks, and mutation callbacks; not every callback is a result transformation.

### 2. Native enabled compatibility

The existing CreateQueriesItemOptions narrows enabled to boolean. Native queryOptions output types include boolean-or-callback enabled even when omitted in the input. Reusing that alias as-is would reject ordinary native factories. The new query/infinite input must retain the core option type; observer, prefetch, and Suspense paths must resolve callback enabled against the appropriate Query rather than treating a function as a truthy boolean.

### 3. Mutation inference and rollback result

A naive contextual MutationObserverOptions return inferred Error as null in a nested-helper/registered-error case. Capturing the concrete returned options before extracting the types fixed the tested cases. Deferred validation must not supply contextual any to newly written callbacks; the prototype reports implicit-any errors for unsupported raw callback composition.

Separately, legacy MutationResult/mutateWith loses TOnMutateResult. The projected core fix requires a corresponding React type change in the same PR. See #21 and #22.

### 4. Infinite page-param precision

The tested upstream infiniteQueryOptions 5.100.10 defaults/tagging widen some result/cache pageParams to unknown[], even though queryFn.pageParam and QueryClient.fetchInfiniteQuery retain the concrete parameter type. Local helpers matched that upstream behavior. Do not silently claim to recover information already lost by an upstream helper or introduce a divergent helper contract while copying it. A precision enhancement can be considered separately.

### 5. Registered keys and defaults

`Register.queryKey = readonly ['app', ...unknown[]]` produced five TS2344 diagnostics in the legacy core type definitions. A projected fix mapped registered key elements into the inline StoreOrValue representation and used QueryKey constraints for family types; valid/invalid key cases then passed.

The prototype also checked registered errors/metadata. Legacy inline calls currently default to Error, while the new factory declarations can use DefaultError. Preserve old explicit-generic behavior and document/test the policy; do not silently broaden this into a breaking generic-default migration.

### 6. Helper implementation and dependency floor

Copying the typed identity helpers from a pinned TanStack version is feasible: retain MIT attribution/license and overload behavior, adapt imports to core, and introduce no runtime dependency on a UI package. Cover defined/undefined initial data and skipToken variants, DataTag data/error inference, and native consumer interoperability.

The declared query-core peer range `^5.0.0` is not justified by checking 5.100.10. The published 5.0.0 package has two-parameter DataTag and lacks some types used by the copied helpers. This proves that the current lower bound is incompatible, not that 5.100.10 is the exact minimum. Determine and test the actual supported floor before shipping.

### 7. Top-level select and combine experiments

The top-level select prototype inferred the canonical case, inherited an existing factory selector when absent, and accepted a raw-data override. It also exposed property-order sensitivity and an unsound conditional override: factory number + optional string selector must yield number | string | undefined. See #24; no claim of production-ready declarations.

A minimal createQueries combine declaration inferred raw/selected item inputs and a separate Store<Combined>. This is local TS 5.9.3 evidence only. Runtime aggregation, full overload discrimination, reference stability, empty groups, and conditional/undefined results remain work in #25.

### 8. Verification scope

The main declaration harness passed on TS 5.7.3 and 5.9.3. It included:

- native/local factories; store/shape/readonly/nullable sources; both QueryClient overloads;
- key, raw/selected data, errors, signal, infinite page inputs, and mutation variables/context;
- compatible helpers consumed by native QueryClient/hooks and existing adapter consumers;
- raw DataTag getQueryData/setQueryData independent of select;
- rejection of mixed forms, async factories, invalid sources/options/variables and unsupported metadata;
- existing core/React type tests redirected to projected declarations;
- registered defaults and the projected registered-key repair;
- declaration emit.

The runner intentionally confirms the **known five legacy registered-key failures** separately and records known inference limits with expected diagnostics. A passing run means the findings are reproduced, not that those production defects are fixed.

The isolated minimal compiler reproduction passed on TS 5.7.3 / 5.9.3 / 6.0.3 / 7.0.2. The query-core notification probe demonstrated suppressed listener updates with notifyOnChangeProps ['data']; see the architecture record. No new adapter runtime implementation has been verified by these experiments.

Exploratory exactOptionalPropertyTypes compilation fails in the current baseline/runtime and some explicit-undefined option cases. It was not an enabled project gate or a passing guarantee. Do not expand #17 into an unrelated whole-repository exact-optional migration.

### Design decisions kept separate

- Keep inline and factory as two forms of the same exports; query matches createQueries.
- No mandatory wrapper when passing ready-made factories.
- Do not manufacture successful inference with any.
- Do not redesign to a builder/curried third form merely on the assumption that it fixes inference; a simple staged-source experiment did not.
- Top-level select is a follow-up convenience, not the only possible solution or a prerequisite for #17.
- Mutation execution snapshots, broader infinite-helper precision, and new UI integrations are not silently settled by the type prototype.
