# Nested factory inference: investigation

## Question

Can a generic declaration preserve both contextual source typing and contextual
`select` typing in this exact shape, without changing the call site?

```ts
createQuery({
  source: $todoId,
  query: todoId => ({
    ...todoOptions({ todoId }),
    select: todo => todo.title,
  }),
})
```

Success requires the source parameter to be `number`, the selector parameter to
be `Todo` (not `any`, `unknown`, or `never`), and the resulting store to be
`Store<string | undefined>`. A declaration merely accepting the call is not a
solution.

## Findings

No declaration-only solution for the original call shape was found in this
investigation. This is NOT a proof that every possible TypeScript declaration
must fail. The evidence establishes a smaller, useful conclusion: the ordinary
generic callback-return design hits a reproducible compiler inference limitation,
independent of Effector, TanStack, overloads, spreads, and inference of `source`.

`minimal.ts` removes all of those factors. It uses just:

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

The annotated parameter `(id: number)`, a no-parameter outer callback, a direct
object argument, and a nested inference helper are positive controls. Their
selector inputs and outputs are checked with exact type assertions, including
a rejection check for a nonexistent property.

The minimal regression/positive-control file passes on **5.7.3, 5.9.3, 6.0.3,
and 7.0.2**. Passing means the failure is still reproduced via an expected
diagnostic and `unknown` assertion, while the controls keep their exact types.
The project's full type contract was previously checked on 5.7.3 and 5.9.3;
the 6/7 checks here do not establish whole-package compatibility with those versions.

## Declaration search

`inference-search.mjs` generates candidate declarations in `.generated/` and
checks them using the installed TypeScript 5.9.3 compiler API. It tries the
following families against both a minimal query-options object and a real native
TanStack `todoOptions` factory:

- ordinary generic return options, with a reactive or already fixed source type;
- `NoInfer` on the source parameter or selector input;
- function/method signatures and the bivariance hack;
- generic callback parameters and generic rest tuples;
- intersections/unions of callback signatures;
- capturing the returned object or the factory function itself;
- conditional extraction of raw data from the captured `queryFn`;
- intersections of captured return types and contextual options;
- mapped/reverse-mapped options and tuple parameter representations;
- inference from a `DataTag` key;
- an intentionally `any`-based negative control, which must fail the exactness
  and invalid-property checks rather than appear to solve the problem.

These are exploratory candidates, not validated replacement public signatures.
Some fail for additional reasons, such as an overly strong generic callback
contract. Their failure counts are not an exhaustive impossibility argument.
The runner records diagnostics and exits successfully even when candidates fail;
inspect its PASS/FAIL output and generated `results.json`.

## Compiler mechanism

In the installed TS 5.9.3 compiler:

1. `hasContextSensitiveParameters` treats an unannotated arrow parameter as
   context-sensitive even when its contextual type is already a concrete number.
2. `checkFunctionExpressionOrObjectLiteralMethod` has a `SkipContextSensitive`
   path. Its special early return-body inference is only used when the function
   has **no context-sensitive parameters**.
3. When later contextual checking needs the selector's input, the raw type can
   be fixed before candidates from the returned object's data have been collected.
4. Annotating the outer parameter enables the early return-body inference path;
   the object's data can supply a candidate before the selector is checked.

`compiler-trace.mjs` instruments a COPY of the compiler, without changing the
installed package, and logs the candidates when `Raw` is fixed:

```text
nested(id => ...)           Raw candidates: []
nested((id: number) => ...) Raw candidates: [{ id: number; title: string }]
nested(() => ...)           Raw candidates: [{ id: number; title: string }]
```

This trace supports the explanation for the minimal declaration. It does not
establish a theorem about all potential signatures or future compiler behavior.

Related primary sources:

- [TypeScript #47599](https://github.com/microsoft/TypeScript/issues/47599)
  discusses the syntactic context-sensitivity problem and possible compiler fixes.
- [TypeScript #48538](https://github.com/microsoft/TypeScript/pull/48538)
  explains inference flow between sibling callbacks and the order limitation.
- [Compiler source at v5.9.3](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/compiler/checker.ts)
  contains the functions described above.

## Design implications

- Do not promise that replacing one options alias or adding `NoInfer` will fix
  the original call shape.
- Do not present a top-level `select` as the only possible API. It is an explicit
  alternative inference boundary with its own order/override cases to test.
- The least syntax change that is already verified is an annotation on the outer
  parameter. A separately typed selector or a native/local options helper also
  preserves safety and portability.
- A comment to Ilya can now include a small independent reproduction, supported
  compiler versions, and an explanation of the mechanism, instead of asserting
  that the original syntax is universally impossible.

## Reproduce

```sh
node node_modules/typescript/bin/tsc -p type-design/research/tsconfig.minimal.json
npm exec --yes --package=typescript@5.7.3 -- tsc -p type-design/research/tsconfig.minimal.json
npm exec --yes --package=typescript@6.0.3 -- tsc -p type-design/research/tsconfig.minimal.json
npm exec --yes --package=typescript@7.0.2 -- tsc -p type-design/research/tsconfig.minimal.json

node type-design/research/inference-search.mjs
node type-design/research/compiler-trace.mjs
```

## Additional consumer-option experiments

- `top-level-select.ts`: positive inference cases and the intentionally recorded
  unsound conditional-override result in the naive declaration. Passing this file
  does not mean that declaration is safe to ship.
- `queries-combine.ts`: positive item/combined-result inference checks only.
- `staged-and-reordered.ts`: exploratory failing examples for simple source currying,
  reordered top-level select, and captured options. Not part of the passing suite.
- `notification-probe.mjs`: query-core listener behavior for data-only vs all notifications.

```sh
node node_modules/typescript/bin/tsc -p type-design/research/tsconfig.consumer-projections.json
node type-design/research/notification-probe.mjs
```
