# PR18 proposed commit organization

Current PR18 head: ca64fedd309a271de044ee41428b2c16a6bc1b9d (58 commits after 08c41a7).
Candidate branch: review/pr18-organized-history (4 commits after the same base).

1. d60e601 — portable core queryOptions/infiniteQueryOptions helpers, license, exports/build entries and helper type tests.
2. 0cd897e — scoped factory forms, options resolution, prefetch, the matching core/React Suspense protocol, runtime/type/inline regression tests.
3. ee94d17 — published declaration consumers and Register verification, including the package test command and ignored emitted fixtures.
4. d660fe5 — factory/helper reference docs and the short queries guide section.

Core and React runtime changes remain atomic because the internal Suspense protocol changes together. A separate ordinary/infinite split would require transitional implementation changes and would be harder to validate as independent steps.

Both tips have tree 46ca5782ca529c855d5959b0870fb6d2884c4e5f. git diff ca64fed d660fe5 is empty: tracked content and file modes are identical.

Validation: step 1 types/build; step 2 types, 198 core + 268 React checks and build; step 3 emitted/registered consumer types; step 4 docs build; final publish checks all passed.

The current PR branch is untouched and remains preserved locally/remotely. The candidate is pushed separately to the user's fork. Applying it later requires replacing the PR branch history with an explicit force-with-lease tied to the reviewed old head. Check the remote head first; do not overwrite later changes. Preserve the old tip under a retained backup branch before replacement. This will change commit IDs and restart CI/review state even though the final diff is identical.
