# Plan 02 — AGENTS.md → Pre-Flight Rules for Next.js Work

> **Source:** `documentation/AGENTS.md`
> **Length:** 3 lines, but binding on **every** frontend change.

---

## 1. The rule in full

> *This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.*

This is a **hard gate**. No code that touches `src/app/`, `next.config.ts`, `next/*` imports, or shadcn components ships without satisfying it.

## 2. Why this matters for *this* project

- `package.json` pins `next@16.2.6` and `react@19.2.4`. Training data for most LLMs predates large parts of Next 16's behavior (Turbopack as default bundler, React Compiler stable, `proxy.ts` replacing `middleware.ts`, stricter `cookies()`/`headers()` semantics, removed `next lint`, removed AMP).
- We use `output: "export"` (per `next.config.ts`), which disables a sizable chunk of the App Router runtime (Server Actions, Route Handlers under runtime, dynamic `headers()`, `proxy.ts`, image optimization). Assumptions from server-rendered Next.js setups *will* be wrong.
- React 19.2 changed enough hooks behavior (`use()`, `useOptimistic`, `useActionState`) that snippets older than ~6 months may compile but mis-behave at runtime.

## 3. Pre-flight protocol (mandatory for any FE change)

Before writing or modifying frontend code, the implementing agent / human MUST:

### Step 1 — Locate the doc

```bash
# from repo root
find node_modules/next/dist/docs -type f -name "*.md" | grep -i <topic>
# example
find node_modules/next/dist/docs -type f -name "*.md" | grep -iE 'static-export|app-router|client-components|use-cache'
```

If `node_modules/next/dist/docs` is empty (some installs strip it), fall back to:

```bash
pnpm view next@16.2.6 dist | grep docs    # confirm shape
# Then read the same file at:
# https://github.com/vercel/next.js/tree/v16.2.6/docs
```

### Step 2 — Read the deprecation block

Every Next 16 doc page has a "Deprecations" / "Breaking changes" section near the top. Read it before reading the API.

### Step 3 — Confirm static-export compatibility

Cross-check the feature against the static-export "Unsupported Features" page. If unsupported, **stop and escalate** — do not implement a server-only feature in a `output: "export"` build.

Known-unsupported-with-`output: "export"` features (do not use):

- `src/app/api/**` Route Handlers (the runtime is removed)
- `proxy.ts` (formerly `middleware.ts`)
- Server Actions
- `cookies()`, `headers()`, `draftMode()`
- `next/image` optimizer (we use `images: { unoptimized: true }`)
- `revalidatePath`, `revalidateTag`
- ISR / on-demand revalidation
- Dynamic `[slug]` routes without `generateStaticParams()`
- `i18n` config block (use sub-path routing if needed)

### Step 4 — Record what you read

Add a one-line comment at the top of any file that relies on Next 16-specific behavior:

```tsx
// next@16.2.6 — verified against node_modules/next/dist/docs/<file>.md on YYYY-MM-DD
```

PR reviewer checks the date is within 30 days. If older, repeat Step 1.

## 4. Auto-trigger rules (when this plan applies)

| Trigger | Action |
|---|---|
| Editing any file under `src/app/` | Run pre-flight protocol for the involved feature(s) |
| Editing `next.config.ts` | Pre-flight + check Tauri compat (Plan 01 NFRs) + diff against `node_modules/next/dist/types/index.d.ts` for changed option types |
| Adding a Next-provided import (`next/link`, `next/navigation`, `next/headers`, ...) | Pre-flight for that import's docs page |
| Upgrading `next` or `react` patch/minor | Re-read the changelog at `node_modules/next/CHANGELOG.md` |
| Adding a shadcn component via `pnpm dlx shadcn` | Verify the generated component does not import server-only APIs |

## 5. Anti-patterns to grep for in PRs

```bash
# Server-only APIs leaking into a static-export build
rg -n "from ['\"]next/headers['\"]"       app
rg -n "from ['\"]next/server['\"]"        app
rg -n "use server"                        app
rg -n "export const dynamic"              app   # only allowed when value === 'force-static'
rg -n "export const revalidate"           app
rg -n "export const fetchCache"           app
rg -n "unstable_after"                    app   # next/server only, not export-safe

# Old Next idioms
rg -n "getServerSideProps|getStaticProps|getInitialProps" .   # legacy pages router — should be zero
rg -n "from ['\"]next/router['\"]"        app   # use next/navigation
rg -n "middleware\.(ts|js)$"              .     # renamed to proxy.ts in Next 16

# Image without unoptimized
rg -n "<Image" app  # confirm prop set or image is replaced with <img>

# Tauri APIs that don't exist in v2
rg -n "tauri::api::"                      src-tauri    # v1 namespace
rg -n "@tauri-apps/api/tauri"             .            # v1 import path; v2 is @tauri-apps/api/core
```

Add this as `scripts/check-agents-rules.sh` and wire into CI.

## 6. Documentation diff job (CI)

Run weekly on `main`:

```yaml
# .github/workflows/agents-doc-drift.yml
name: agents-doc-drift
on:
  schedule: [{ cron: '0 6 * * 1' }]  # Mon 06:00 UTC
  workflow_dispatch:
jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm i --frozen-lockfile
      - run: |
          mkdir -p .agents-snapshot
          tar -cf .agents-snapshot/next-docs.tar -C node_modules/next/dist docs
      - uses: actions/cache@v4
        with:
          path: .agents-snapshot
          key: next-docs-${{ hashFiles('.agents-snapshot/next-docs.tar') }}
      - run: |
          if [ -f .agents-snapshot/previous.tar ] && ! cmp -s .agents-snapshot/next-docs.tar .agents-snapshot/previous.tar; then
            echo "::warning::next docs changed — re-run pre-flight on touched FE files"
          fi
```

Failing/warning job opens an issue tagged `agents:doc-drift`.

## 7. New-contributor onboarding (one-pager)

Add `CONTRIBUTING.md` snippet:

```md
## Before touching any .tsx

This project uses Next.js 16.2.6 with `output: "export"`. Many things you remember from older Next.js are gone or different.

1. Open the doc page for the feature you're touching:
   `node_modules/next/dist/docs/<area>/<feature>.md`
2. Skim "Deprecations" first.
3. Confirm it works with `output: "export"`.
4. Stamp the file with a verification comment (see plans/02_AGENTS_PLAN.md §3.4).
5. If the doc disagrees with this codebase, the doc wins — file an issue.
```

## 8. Execution checklist

- [ ] **A-1** Add `scripts/check-agents-rules.sh` with the greps from §5; wire into `npm run check` and pre-commit.
- [ ] **A-2** Add `.github/workflows/agents-doc-drift.yml` from §6.
- [ ] **A-3** Add `CONTRIBUTING.md` with the onboarding section from §7.
- [ ] **A-4** Add a `// next@16.2.6 — verified ...` ESLint rule (custom rule or jsdoc comment regex) so PRs without the stamp fail.
- [ ] **A-5** Replace `README.md` placeholder content (currently the create-next-app default) with project-specific instructions linking to `documentation/GOAL.md` and `plans/README.md`.
- [ ] **A-6** Confirm `src/app/` has zero unsupported-with-static-export imports (run the §5 greps once, fix any hits, then enable the check).

## 9. Acceptance criteria

This plan is satisfied when:

1. Every existing or future `.tsx` file under `src/app/` carries a verification stamp comment, OR is documented as not relying on Next-specific behavior.
2. The §5 greps return zero hits on `main`.
3. The doc-drift workflow has run at least once successfully.
4. `CONTRIBUTING.md` is in the repo and linked from `README.md`.

## 10. Open questions

- **Do we want to mirror `node_modules/next/dist/docs/` into `docs/_vendored/next-16.2.6/`** so PR reviewers can read the exact docs offline? (Pro: deterministic. Con: bloats repo.) Decide in ADR-002.
- **ESLint stamp-checker as a separate plugin or jsdoc regex?** Prefer the jsdoc regex for v0.1, plugin later if false-positive rate is high.
