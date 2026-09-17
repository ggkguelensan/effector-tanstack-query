---
title: QueryClientCompatProvider
description: Bridges the effector-scoped QueryClient into @tanstack/react-query's context so both APIs share one cache during a migration.
---

```tsx
import { QueryClientCompatProvider } from '@effector-tanstack-query/react/compat'

function MigrationArea({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientCompatProvider
      defaultOptions={{ queries: { retry: false, staleTime: 60_000 } }}
    >
      {children}
    </QueryClientCompatProvider>
  )
}
```

A bridge for running `@tanstack/react-query` and `@effector-tanstack-query` **side-by-side on one `QueryClient`** while you migrate components. Vanilla hooks resolve the client from React **context** (`<QueryClientProvider>`); this library resolves it from the **effector scope** (`useUnit($queryClient)`). This component reads the scope's client and hands that exact instance to `<QueryClientProvider>`, so both APIs read and write the same cache.

Lives in a separate subpath (`@effector-tanstack-query/react/compat`) and pulls in `@tanstack/react-query`, an **optional peer dependency** — non-migrating users never install it.

## Behavior

- **Client.** `useUnit($queryClient)` returns the singleton browser `QueryClient` set by your top-level provider; the component forwards it to `<QueryClientProvider>`. `defaultOptions` is ignored here — the singleton already carries its own.
- **Server (RSC).** `$queryClient` is `serialize: 'ignore'`, so `useUnit($queryClient)` resolves to `null` inside the RSC scope. The component then creates a **throwaway per-render `QueryClient`** (via a `useState` initializer, using `defaultOptions`) purely so vanilla `useQuery` has a provider during the server pass. Pair it with `<HydrationBoundary>` from `@tanstack/react-query` to fill that fallback with prefetched data — no loading flash.
- **Hydration handover.** When the client mounts, `useUnit($queryClient)` flips from `null` to the singleton, the provider re-renders, and react-query re-subscribes its observers against the shared browser client. The throwaway server client is GCed with its React tree.

## Type signature

```ts
function QueryClientCompatProvider(
  props: QueryClientCompatProviderProps,
): React.ReactElement

interface QueryClientCompatProviderProps {
  children: React.ReactNode
  /**
   * `defaultOptions` for the per-render server fallback `QueryClient`.
   * Has no effect on the client — there it forwards the singleton built
   * in your top-level provider. Keep these aligned with your
   * `createQuery({ staleTime, retry, ... })` so SSR HTML matches the
   * client after hydration.
   */
  defaultOptions?: DefaultOptions
}
```

## See also

- [Migrating from `@tanstack/react-query`](/effector-tanstack-query/guides/ssr/migration/) — the full SSR walkthrough: shared keys, the prefetch-once pattern, provider ordering, and pitfalls.
- [`HydrationBoundary`](/effector-tanstack-query/react/hydration-boundary/) — the effector-native cache hydration used **after** the migration is finished.
