# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TheAtlas Media — cross-platform desktop app for downloading, extracting, and converting media (video/audio). Next.js 16 static-export frontend + Tauri 2 / Rust backend. Local-first, no telemetry. License: AAKNCL v1.0 (non-commercial). Repo: github.com/atlasatakahraman/TheAtlas-Media. (`AGENTS.md` redirects here.)

**Pre-release.** The desktop shell and the dependency-management system are done. The media workflows (download/convert/extract) are not — see "What is actually implemented" below before assuming a feature exists.

## Stack

- Frontend: Next.js 16.2.9 (App Router, `output: "export"`, `trailingSlash: true`), React 19, TS strict, Tailwind v4, shadcn/ui (style `radix-nova`, baseColor `neutral`), Radix UI, lucide-react
- Backend: Rust **1.97.1** (pinned in `rust-toolchain.toml` + `Cargo.toml` `rust-version`), Tauri 2.11 in `src-tauri/`
- Package manager: **Bun only** — every script runs through `bun --bun <tool>`; don't default to npm/npx/node
- Windows installer: NSIS only (WiX deliberately unused, see `src-tauri/tauri.conf.json`)
- Formatting: tabs, width 4, LF (`.editorconfig`, `.prettierrc`); Rust/TOML use 4 spaces

## Commands

```bash
bun run dev                  # tauri dev (starts Next dev server via beforeDevCommand)
bun run next:dev             # frontend only, no desktop shell
bun run build                # tauri build
bun run build:linux          # Linux wrapper (AppImage/deb/rpm)
bun run build:arch           # Arch package via packaging/arch/PKGBUILD

bun run lint                 # eslint
bun tsc --noEmit             # typecheck
bash scripts/check-agents-rules.sh      # static-export + stamp guardrails (needs rg)
bash scripts/check-animation-rules.sh   # animation guardrails (see note below)
bash scripts/check-compat.sh            # Node/Rust versions + tsc + cargo fmt + clippy

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo check --no-default-features
cargo test --no-default-features
```

CI (`.github/workflows/ci.yml`) runs all of the above on ubuntu/macos-14/windows. Two nuances:

- `check-animation-rules.sh` is invoked as `|| true`. It is **expected to exit 1** because shadcn primitives use `transition-all`. A red animation check is not a regression you introduced — confirm before "fixing" it.
- `check-compat.sh` still gates Rust at ≥1.89 while everything else pins 1.97.1. Known inconsistency; leave it unless the task is specifically about the toolchain.

## Architecture

Three layers, no application server. Next.js exports to `out/`, Tauri loads it, native work crosses IPC.

- `src/app/` — routes. **A root-level `app/` must NOT exist** — it silently shadows `src/app/`, and `check-agents-rules.sh` fails the build if it finds one.
- `src/layout/` — frameless-window shell: `header/`, `sidebar/` (`Appbar.tsx` search-filter, deep-dived in `docs/appbar/logic.md`), `view/AppView.tsx` (composes SidebarProvider + Header + Toaster; owns the global Ctrl/Cmd-F and type-to-search key handling).
- `src/components/` — product components. `src/components/ui/` is vendored shadcn code: lint-exempted, don't hand-fix style there.
- `src/hooks/`, `src/lib/` — dependency/window/system state and shared helpers.
- `src-tauri/src/lib.rs` — Tauri setup, OS/display detection, and the `invoke_handler` registry. **This is the authoritative list of what IPC commands exist.**
- `src-tauri/src/commands/` — `dependency.rs`, `install.rs`, `update.rs` hold the real commands.

### The IPC boundary (important)

There is no codegen. ESLint's `no-restricted-imports` message tells you to use `lib/api-contracts.gen.ts` — **that file does not exist and is not generated.** The actual, hand-maintained pattern is:

1. Thin `invoke()` wrappers in `src/lib/*-env.ts` (`dependency-env.ts`, `system-env.ts`, `window-env.ts`).
2. TS types in `src/lib/types.ts` that mirror the Rust structs by hand. The comments there record the contract (`#[serde(rename_all = "camelCase")]`, `Option<String>` → `string | null`). If you change a Rust struct, update this file in the same pass.
3. Progress is pushed, not polled: Rust emits an `install-progress` event carrying `InstallProgress` (`src/hooks/use-install.ts`), throttled Rust-side to ~250ms or ≥1% delta.

`system-env.ts` / `window-env.ts` memoize their `invoke` behind a module-level promise cache — reuse that pattern rather than adding new round-trips.

### State

No state library. Two established patterns, both module-level:

- `src/hooks/use-dependency.ts` — global `cachedReport` + a listener `Set`, with `refreshDependencies()` as the single write path. Call it after any install/uninstall/update action.
- `src/hooks/use-install.ts` — module-level `sizeCache` Map; dialogs open instantly with `sizeMb: undefined` and get patched when the background size lookup resolves.

Tool names are aliased throughout (`ytdlp` ↔ `yt-dlp`); use `getAliasKeys`/`formatToolName` (`src/lib/tool-names.ts`) instead of comparing raw strings.

### Dependency system

Resolution order per tool (`src-tauri/src/commands/dependency.rs`): env override (`THEATLAS_FFMPEG_PATH`, `THEATLAS_FFPROBE_PATH`, `THEATLAS_YTDLP_PATH`) → app-managed dir under `app_data_dir()` → system `PATH`. Managed installs download from BtbN FFmpeg-Builds and yt-dlp releases and are SHA-256 verified against a fetched `.sha256` / `SHA2-256SUMS` before being accepted.

### Linux/Wayland

`src-tauri/src/main.rs` sets `WEBKIT_DISABLE_COMPOSITING_MODE` / `WEBKIT_DISABLE_DMABUF_RENDERER`, and `lib.rs` sets `__NV_DISABLE_EXPLICIT_SYNC`, to avoid compositor deadlocks. Window position/maximize are no-ops on Wayland by design (`getWindowCapabilities`). Don't remove these as dead code.

## What is actually implemented

`src/layout/sidebar/data.ts` declares ~97 route URLs. **Only about five pages exist**: `/`, `/youtube/download`, `/youtube/download/video`, `/settings/dependencies`, `/404`. The sidebar is a product map, not a feature list — most links 404.

Likewise, these are empty or stub placeholders for the in-progress media layer, not working code: `src-tauri/src/commands/youtube.rs` (empty), `src/hooks/use-api.ts` (empty), `src-tauri/src/commands/model.rs` (two `#[allow(dead_code)]` structs).

## Hard constraints (enforced by eslint + scripts/*.sh)

1. **Static export only** — no `next/headers`, `next/server`, `"use server"`, `export const dynamic|revalidate|fetchCache`, `unstable_after`, `middleware.ts`, `getServerSideProps`/`getStaticProps`. There is no server.
2. **No `next/router`** — `next/navigation` only.
3. **No `<Image>`** at all in frontend dirs (images are globally `unoptimized`) — use plain `<img>`.
4. **Tauri v2 only** — no `tauri::api::` (Rust) or `@tauri-apps/api/tauri` (JS) v1 leftovers.
5. **Never import from `src-tauri/` in TS** — go through the `src/lib/*-env.ts` wrappers.
6. **Animation: GPU properties only** — animate `transform`/`opacity`; never `transition-all` or transitions on width/height/top/left/padding/margin. RAF loops must drive refs, not `useState`.
7. **Every `.tsx` under `src/app/` or `src/layout/`** must contain the verification stamp `// next@16.2.9 — verified against node_modules/next/dist/docs/<path>.md on <date>`. The check only tests for presence anywhere in the file, but convention is line 1 — copy the exact format from a neighbouring file.

## Known gaps — don't chase these

- `eslint.config.mjs` and the check scripts reference `plans/02_AGENTS_PLAN.md`, `plans/04_SKILL_PLAN.md`, `plans/07_ANIMATION_PLAN.md`, `ANIMATION.md`, and `docs/known-issues.md`. **None of these exist.** The scripts themselves are the current source of truth.
- `src/components/ui/**` and `src/hooks/use-mobile.ts` are warn-only (not error) for `no-restricted-syntax`, `react-hooks/set-state-in-effect`, and `no-explicit-any`. Leave as-is outside a dedicated cleanup pass.

## Workflow

- Keep this file lean; use on-demand docs (`docs/`) for deep dives instead of expanding it.
- Split Rust and TypeScript work into separate sessions where practical.
- Use `rg` (ripgrep) for finding strings/symbols — the guard scripts require it on PATH anyway.
