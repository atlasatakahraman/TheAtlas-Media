# CLAUDE.md

Instructions for Claude/agents working in this repo. (`AGENTS.md` redirects here.)

## Project

TheAtlas Media — cross-platform desktop app for downloading, extracting, and converting media (video/audio). Sub-project of the not-yet-scaffolded TheAtlas monorepo. Next.js 16 static-export frontend + Tauri 2 / Rust backend. Local-first, no telemetry. License: AAKNCL v1.0 (non-commercial). Repo: github.com/atlasatakahraman/TheAtlas-Media.

## Stack

- Frontend: Next.js 16 (App Router, `output: "export"`), TS strict, Tailwind v4, shadcn/ui (style `radix-nova`, baseColor `neutral`), Radix UI, lucide-react
- Backend: Rust 1.89+, Tauri 2.11 (`src-tauri/`); rustfmt + clippy pinned via `rust-toolchain.toml`
- Package manager: **Bun only** — every script runs through `bun --bun <tool>`; don't default to npm/npx/node
- Windows installer: NSIS only (WiX deliberately disabled, see `src-tauri/tauri.conf.json`)

## Commands

- `bun --bun tauri dev` / `bun --bun tauri build` — run / build the app
- `bun --bun next dev --turbopack` / `bun --bun next build` — frontend only
- `bun --bun eslint` — lint
- `bun --bun tsc --noEmit` — typecheck
- `cd src-tauri && cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` — Rust format/lint
- `bash scripts/check-compat.sh` — full gate: Node ≥20.9, Rust ≥1.89, tsc, cargo fmt, clippy
- `bash scripts/check-agents-rules.sh` / `check-animation-rules.sh` — static-export & animation guardrails (rg-based); run before committing frontend changes

## Architecture

- `src/app/` — Next.js routes. A root-level `app/` must NOT exist — it silently shadows `src/app/`.
- `src/components/ui/` — shadcn-generated primitives (vendor code; lint-exempted, don't hand-fix style there)
- `src/layout/` — custom frameless-window shell: `header/`, `sidebar/` (incl. `Appbar.tsx` search-filter, deep-dived in `docs/appbar/logic.md`), `view/`
- `src/hooks/`, `src/lib/` — window/system env helpers, utils
- `src-tauri/src/` — `commands/mod.rs` is an empty stub (no IPC commands yet); `lib.rs` only has OS/display-server detection + window positioning so far. `src-tauri/src/mod.rs` looks like an orphaned duplicate not wired into `main.rs` — verify before relying on it.

## Hard constraints (enforced by eslint + scripts/*.sh)

1. **Static export only** — no `next/headers`, `next/server`, `"use server"`, `export const dynamic|revalidate|fetchCache`, `unstable_after`, `middleware.ts`, `getServerSideProps`/`getStaticProps`. There is no server.
2. **No `next/router`** — `next/navigation` only.
3. **No `<Image>`** without `unoptimized` (images are globally unoptimized) — prefer plain `<img>`.
4. **Tauri v2 only** — no `tauri::api::` (Rust) or `@tauri-apps/api/tauri` (JS) v1 leftovers.
5. **Never import from `src-tauri/` in TS** — go through `lib/api-contracts.gen.ts` (not created yet; a planned codegen boundary, not an existing file).
6. **Animation: GPU properties only** — animate `transform`/`opacity`; never `transition-all` or transitions on width/height/top/left/padding/margin. RAF loops must drive refs, not `useState` (see the lerp-cursor pattern in `src/components/ui/input.tsx`).
7. **New `.tsx` under `src/app/` or `src/layout/`** needs a line-1 stamp: `// next@16.2.9 — verified against node_modules/next/dist/docs/<path>.md on <date>` — copy the exact format from any existing file in those dirs.

## Known gaps — don't chase these

- `eslint.config.mjs` and the check scripts reference `plans/02_AGENTS_PLAN.md`, `plans/04_SKILL_PLAN.md`, `plans/07_ANIMATION_PLAN.md`, and `docs/known-issues.md` — **none of these exist in the repo.** The scripts themselves are the current source of truth.
- `src/components/ui/**` and `src/hooks/use-mobile.ts` are warn-only (not error) for the animation and `no-explicit-any` rules — leave as-is outside a dedicated cleanup pass.

## Workflow

- Keep this file lean; use on-demand docs/skills for deep dives instead of expanding it.
- Split Rust and TypeScript work into separate sessions where practical.
- Use `rg` (ripgrep), not built-in search tools, for finding strings/symbols in this repo.
