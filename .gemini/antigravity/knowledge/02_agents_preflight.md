# Next.js 16 pre-flight protocol (AGENTS.md mandate)

This is NOT the Next.js most training data knows.

Before touching any `.tsx`, `next.config.ts`, `next/*` import, or shadcn component:

1. **Locate the doc**:
   ```bash
   find node_modules/next/dist/docs -type f -name "*.md" | grep -iE '<topic>'
   ```
2. **Read the "Deprecations" / "Breaking changes" block first.**
3. **Check static-export compatibility.** This repo uses `output: "export"`. Forbidden with static export:
   - `app/api/**` Route Handlers
   - `proxy.ts` (formerly `middleware.ts`)
   - Server Actions
   - `cookies()`, `headers()`, `draftMode()`
   - `next/image` optimizer (we use `unoptimized: true`)
   - `revalidatePath`, `revalidateTag`, ISR
   - Dynamic routes without `generateStaticParams()`
   - `i18n` config block
4. **Stamp the file** with a verification comment:
   ```tsx
   // next@16.2.6 — verified against node_modules/next/dist/docs/<file>.md on YYYY-MM-DD
   ```

Reviewer checks the stamp date is within 30 days. Older → re-read.

If a doc you need is missing from `node_modules/next/dist/docs/`, file an issue and read it at `https://github.com/vercel/next.js/tree/v16.2.6/docs` instead — *then* document the gap.
