# Factory API design record

This branch archives the design and declaration experiments before runtime implementation.
It is based on master `08c41a7`. It is supporting evidence, not a merge-ready feature PR.
Existing PR #18 will implement the revised target separately; its old diff is not the specification.

## Canonical design documents

- [Framework-agnostic target and responsibilities](architecture.md)
- [Type investigation, evidence and limitations](type-findings.md)
- [Implementation sequence and regression gates](implementation-plan.md)
- [Prototype audit and rerun instructions](../README.md)
- [Compiler investigation and minimal reproduction](../research/README.md)

## Issue / PR roadmap

| Issue | Target | Planned PR relationship |
| --- | --- | --- |
| [#17](https://github.com/ilyaagarkov/effector-tanstack-query/issues/17) | Query/infinite source + query form and core helpers | Existing [#18](https://github.com/ilyaagarkov/effector-tanstack-query/pull/18) |
| [#21](https://github.com/ilyaagarkov/effector-tanstack-query/issues/21) | Preserve onMutate result through core/React types | Focused prerequisite fix for #22 |
| [#22](https://github.com/ilyaagarkov/effector-tanstack-query/issues/22) | Mutation factories, mutationOptions helper, execution semantics | Follow-up using #18 foundations and #21 types |
| [#23](https://github.com/ilyaagarkov/effector-tanstack-query/issues/23) | Compatible factories in existing createQueries | Follow-up to #18; preserve existing family semantics |
| [#24](https://github.com/ilyaagarkov/effector-tanstack-query/issues/24) | Consumer-level top select | Optional follow-up after inference/override cases are solved |
| [#25](https://github.com/ilyaagarkov/effector-tanstack-query/issues/25) | Family combine and proposed $combined | Follow-up after #23 |

All new semantics remain proposals for maintainer review. Evidence is labeled with its tested
versions and does not claim runtime implementation, universal TypeScript impossibility,
or compatibility with untested framework-specific reactive option types.
