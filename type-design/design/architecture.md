## Design record: framework-agnostic responsibilities and compatibility

This records the working target behind #17 / #18 and follow-ups #21–#25. It is a design proposal and implementation contract for review, not a report that the current PR diff implements it. In particular, the old `createQueryFromOptions` diff is not the target interface.

### The two adoption paths

1. An existing TanStack application introduces Effector and consumes its existing options factories through the adapter, without duplicating queryKey/queryFn or making the definitions Effector-aware.
2. An existing Effector application adopts portable options factories using core-only helpers, and can also use those definitions with QueryClient, SSR, or native UI adapters.

The desired seam is **TanStack Query Core ↔ Effector**. React, Vue, Solid, Angular, Svelte, and server-side code are possible consumers around that seam. React examples explain familiar composition; React is not the definition of the core contract.

### Responsibilities

| Module/layer | Owns |
| --- | --- |
| Portable `.qk` / `.qo` / `.mo` definitions | Keys, query/mutation functions, shared policies, reusable projections, and their types; accepts plain parameter values |
| TanStack Query Core | Cache identity, query/mutation execution, observers, cancellation, retries and native cache behavior |
| Effector adapter | Resolving source, coherent option updates, observer subscriptions, stores/events, scope binding, client selection, prefetch and model-side SSR |
| UI integration | Component subscriptions/lifecycle, framework context, suspense/error presentation, integration with a particular renderer |

The file suffixes are optional application organization, not a required adapter convention. Creating/executing the Effector model must not require a UI hook or UI package. New framework bindings are separate features when a concrete need exists; do not make #17 depend on implementing all of them.

### Creation forms and naming

Use the names **inline** and **factory**. Keep the existing exports, with overloads distinguishing queryKey from source + query. No third spread-at-the-top form and no dedicated createQueryFromOptions export are planned.

```ts
const todoOptions = ({ todoId }: { todoId: number }) => queryOptions({
  queryKey: ['todos', 'detail', { todoId }],
  queryFn: ({ signal }) => fetchTodo(todoId, { signal }),
})

const todo = createQuery({
  name: 'todo.detail',
  source: { todoId: $todoId },
  query: todoOptions,
})
```

`query` inherits the role/name already used by createQueries. `createInfiniteQuery` gets the corresponding form. Both retain overloads with an explicit QueryClient. The future mutation form uses `mutation`; its separate execution semantics are tracked in #22.

### Source and mental model

- Source is `Store<T>` or a shallow shape of stores. A store's value can itself contain structured/readonly/nullable values. No recursive traversal of nested store shapes, event source, or implicit resolution of arbitrary framework refs is promised.
- The factory receives resolved values and is pure/synchronous. It can run during model construction/resolution and source changes; it is not an execution callback. Network work belongs in queryFn/mutationFn.
- `source changed -> recompute options -> update observer -> TanStack decides whether to fetch`. Not every source update is a fetch; a select-only update at the same key should update the projection without forcing a request.
- Changes from one Effector graph transaction must not apply incoherent combinations of key/function/options to an observer. Read current values in the correct scope; do not implement this with imperative getState reads.
- `enabled: false` does not skip evaluating the options factory or narrow a nullable parameter. A factory that accepts absence can use core-compatible skipToken or other explicit handling. skipToken is not equivalent to a valid disabled queryFn for manual refetch.
- Query keys identify cached data. Standard structured plain keys are supported; factory-returned keys are not restricted to flat arrays. This does not imply recursively unwrapping stores inside them. TypeScript's broad QueryKey cannot prove that every nested value is serializable or free of reactive wrappers.
- Source must include the changing dependencies of the factory. Reading external mutable state inside it defeats the reactive contract.

### Data and type ownership

```text
queryFn -> raw data in QueryClient
select -> data of one observer / Effector query result
combine -> optional future family-level projection (#25)
```

Initial/placeholder data keep the expected underlying query shape; they are not extra independent result transforms. Native initialData overloads and an Effector store's initialization/lifecycle guarantees are different: do not remove undefined from `$data` merely because a native hook would return defined data.

For mutations, mutationFn determines data. onMutate produces a separate value consumed by later callbacks; returning a value from onSuccess does not transform mutation data. #21 preserves that callback result type, and #22 defines source/variables/in-flight behavior.

### Options and overrides

In #17, top-level adapter fields are name, enabled, and refetchInterval. A defined top-level override replaces the factory value; undefined inherits it; false is meaningful. This is override precedence, not an AND gate between two enabled values. Factory-side enabled must accept the native callback form as well as boolean.

All other public query options, including select, remain available in the factory result. Top-level select is optional follow-up #24. Its proposed semantics are replacement over raw data, not selector chaining. Conditional overrides need sound union result types.

Options may be calculated together from source:

```ts
createQuery({
  source: { todoId: $todoId, isEnabled: $isEnabled, interval: $interval },
  query: ({ todoId, isEnabled, interval }) => ({
    ...todoOptions({ todoId }),
    enabled: isEnabled,
    refetchInterval: interval,
  }),
})
```

### Compatibility table

| Input/behavior | Target |
| --- | --- |
| Plain core-compatible options; native/local typed helpers | Accept without requiring a brand or an Effector-specific factory |
| TanStack raw data/error tags and registered keys/defaults | Preserve within the verified dependency range |
| Core fetch/cache/observer options | Apply with their native meaning, subject to explicit adapter-owned normalization |
| Framework-specific refs/signals/accessors requiring that framework's tracking | No automatic tracking or unwrapping by the Effector adapter |
| React subscribed/render lifecycle behavior | Does not control core Effector subscriptions |
| Suspense / error-boundary presentation | Responsibility of an explicitly integrated consumer; not arbitrary throws from the Effector graph |
| Internal defaulting/optimistic flags | Adapter/TanStack infrastructure owns them |
| Async options factory | Unsupported; queryFn may be async |
| Mixing inline and factory definitions | Compile-time rejection, including stored objects/spreads where feasible |

Not all framework helpers produce the same broad types. Compatibility means that the returned options work with core; a helper's name/import alone is not sufficient. For example, Vue Query adds reactive key/option handling: https://tanstack.com/query/latest/docs/framework/vue/reactivity

### Observer notification policy: a refinement needed in #17

`notifyOnChangeProps` filters QueryObserver listeners; it is not just a React rendering flag. This adapter drives `$data`, `$status`, `$error`, `$isFetching`, and finished events from those listeners. Passing `['data']` through can suppress state transitions that the Effector model needs.

A query-core 5.100.10 probe refetched the same cached object:

```text
notifyOnChangeProps: ['data'] -> observer.isFetching became true, no listener calls
notifyOnChangeProps: 'all'    -> listener isFetching values [true, false]
```

Proposed target: normalize observers feeding Effector stores to complete notifications (`'all'`) after composing defaults/factory overrides. UI consumers select the stores they need. Tests must also cover scope, lifecycle events, family observers, and interactions with existing consumers.

`throwOnError` / experimental_prefetchInRender may have supporting behavior in query-core, but their UI semantics are not created just by passing the flags to core. Define which behavior the adapter consumes; do not claim blanket React equivalence or classify every such field as a runtime no-op.

Do not mutate a factory's returned object. Normalize a copy at the consumption seam. Do not reject an entire native helper return type with `unsupportedField?: never`: native output types often include optional fields the caller never actually supplied. This differs from rejecting mixed adapter creation forms.

### Scope, lifecycle and SSR

Creation, observer activation/subscription, and network execution are distinct. Core operation must be testable without components. Prefetch and the existing pre-mount Suspense observer path must read the current complete options in the correct scope, not construction-time closures.

The adapter binds its own events back into the originating Effector scope. Arbitrary user callbacks in TanStack options remain ordinary JS callbacks; they are not automatically made scope-safe. Model reactions naturally use adapter events with sample; callbacks invoked outside Effector need deliberate scope binding when they call scoped units.

Preserve refcounted observer ownership: unmounting one consumer must not tear down another consumer's subscription. The fixes in #19 / #20 are part of the master baseline, not optional behavior to reintroduce later.
