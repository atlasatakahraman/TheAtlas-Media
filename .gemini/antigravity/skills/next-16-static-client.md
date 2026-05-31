# Skill: Next.js 16 client component (static export)

Every client component starts with:

```tsx
'use client';
// next@16.2.6 — verified against node_modules/next/dist/docs/<file>.md on YYYY-MM-DD
```

The verification stamp date must be within 30 days. If you can't actually read the doc file, do NOT fabricate a date — leave the comment as `TODO: verify` and surface to the operator.

Allowed imports in a static-export build:
- `next/link`, `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`)
- `next/font/...`
- `next/script` (with caveats)

**Forbidden** in a static-export build:
- `next/headers` (`cookies`, `headers`, `draftMode`)
- `next/server` (`NextResponse`, `unstable_after`)
- `'use server'`
- `app/api/**` Route Handlers (the runtime isn't shipped)
- `export const dynamic`, `export const revalidate`, `export const fetchCache`
- `next/image` optimizer (use `<img>` or `<Image unoptimized>`)

If you need data, fetch it via Tauri commands (`@tauri-apps/api/core` `invoke`), not via Next.js server features.

Server components are still allowed for *layout* shells that have no client-side reactivity — but Tauri's webview will render the same static HTML either way, so the marginal value is small. Default to client components for anything that calls `invoke`.
