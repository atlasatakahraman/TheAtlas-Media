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

bun run check                # everything below, in order — run this before committing
bun run lint                 # eslint
bun run typecheck            # tsc --noEmit
bun run verify:search        # property tests for the shared search engine
bun run scaffold <route>     # generate a page unit + nav entry (see "Adding a page")
bash scripts/check-agents-rules.sh      # static-export + stamp guardrails (needs rg)
bash scripts/check-structure.sh         # component/page unit conventions + nav registry
bash scripts/check-animation-rules.sh   # animation guardrails (see note below)
bash scripts/check-compat.sh            # Node/Rust versions + tsc + cargo fmt + clippy

cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo check --no-default-features
cargo test --no-default-features
cargo deny check             # advisories, licences, banned crates, sources
```

CI (`.github/workflows/ci.yml`) runs all of the above on ubuntu/macos-14/windows, plus a
one-runner `supply-chain` job for `cargo deny`. Three nuances:

- `check-animation-rules.sh` is invoked as `|| true` because it was once expected to exit 1 on shadcn `transition-all`. **It currently exits 0** and should stay there — if it starts failing, that is a real regression, not the historical baseline.
- `check-compat.sh` still gates Rust at ≥1.89 while everything else pins 1.97.1. Known inconsistency; leave it unless the task is specifically about the toolchain.
- `cargo audit` is deliberately **not** also run. It reads the same RustSec database that `cargo deny check advisories` does, so it would only re-report the same findings.

## Architecture

Three layers, no application server. Next.js exports to `out/`, Tauri loads it, native work crosses IPC.

- `src/app/` — routes. **A root-level `app/` must NOT exist** — it silently shadows `src/app/`, and `check-agents-rules.sh` fails the build if it finds one.
- `src/layout/` — frameless-window shell: `header/` (slot registry), `sidebar/` (`Appbar.tsx` search-filter, deep-dived in `docs/appbar/logic.md`), `page/` (`page-shell/` + `create-page-layout.tsx`), `view/AppView.tsx` (composes SidebarProvider + Header + Toaster; owns the global Ctrl/Cmd-F and type-to-search key handling, and **is the page scroll container** — a route layout must not add a second one).
- `src/registry/` — the data the shell is built from: `nav/` (one file per product domain, merged and validated in `nav/index.ts`), `tools.ts` (one `ToolSpec` per managed binary), `icons.ts` + `icon.tsx` (explicit name → lucide map, so icons stay tree-shakeable).
- `src/components/` — product components. `src/components/custom/` is ours and reusable; `src/components/<page>/` is page-scoped. `src/components/ui/` is vendored shadcn code: lint-exempted, don't hand-fix style there, and **never put our files inside it** — the shadcn CLI overwrites that tree.
- `src/hooks/`, `src/lib/` — dependency/window/system state and shared helpers.
- `src-tauri/src/lib.rs` — Tauri setup, state registration, OS/display detection, and the `invoke_handler` registry. **This is the authoritative list of what IPC commands exist.**
- `src-tauri/src/core/` — the business logic, and **nothing in it imports `tauri`**. `tools/` (`registry.rs` `ToolSpec`/`BundleSpec` tables, `probe.rs` resolution + caches, `download.rs`, `extract.rs`, `verify.rs`, `install.rs`, `freshness.rs`, `types.rs`) and `store/` (`kv.rs`, `disk.rs`). Every input arrives as an argument, which is why 100 unit tests run with no Tauri runtime.
- `src-tauri/src/commands/` — thin `#[tauri::command]` adapters only: validate → call `core::` → return. `unwrap`/`expect`/`panic` are deny-linted for the whole module tree. Put a decision here and it becomes an untested decision.
- `src-tauri/src/error.rs` — `AppError`, the one error type that crosses IPC. `src-tauri/src/state.rs` — `AppPaths` + `AppState`, registered once as `.manage(Arc<AppState>)`. `src-tauri/src/sys/` — the **only** place `unsafe` is allowed (`#![deny(unsafe_code)]` at the crate root, one documented `#[allow]` inside).

### The IPC boundary (important)

There is no codegen. ESLint's `no-restricted-imports` message tells you to use `lib/api-contracts.gen.ts` — **that file does not exist and is not generated.** The actual, hand-maintained pattern is:

1. Thin `invoke()` wrappers in `src/lib/*-env.ts` (`dependency-env.ts`, `system-env.ts`, `window-env.ts`).
2. TS types in `src/lib/types.ts` that mirror the Rust structs by hand. The comments there record the contract (`#[serde(rename_all = "camelCase")]`, `Option<String>` → `string | null`). If you change a Rust struct, update this file in the same pass.
3. Progress is pushed, not polled: Rust emits an `install-progress` event carrying `InstallProgress` (`src/hooks/use-install.ts`), throttled Rust-side to ~250ms or ≥1% delta.
4. **Errors are objects, not strings.** Every command returns `Result<T, AppError>`, which serializes adjacently tagged as `{ kind, message }` — so `String(e)` renders `[object Object]`. Use `errorMessage(e)` from `src/lib/types.ts` for display, and `isAppError(e) && e.kind === "…"` when the handling should differ by cause. The `kind` set is the contract; the prose is not. Absolute paths in a message have the home directory rewritten to `~` before they leave Rust.

`system-env.ts` / `window-env.ts` memoize their `invoke` behind a module-level promise cache — reuse that pattern rather than adding new round-trips.

### State

No state library. Two established patterns, both module-level:

- `src/hooks/use-dependency.ts` — global `cachedReport` + a listener `Set`, with `refreshDependencies()` as the single write path. Call it after any install/uninstall/update action.
- `src/hooks/use-install.ts` — module-level `sizeCache` Map; dialogs open instantly with `sizeMb: undefined` and get patched when the background size lookup resolves.

Tool names are aliased throughout (`ytdlp` ↔ `yt-dlp`); use `getAliasKeys`/`formatToolName` (`src/lib/tool-names.ts`) instead of comparing raw strings.

### Dependency system

Adding a managed tool is **one `ToolSpec` literal in `src-tauri/src/core/tools/registry.rs`** plus the matching entry in `src/registry/tools.ts` — no match arm anywhere else. `BundleSpec` is a separate table because ffmpeg and ffprobe are two tools that arrive in one archive; requesting either downloads it once.

Resolution order per tool (`core/tools/probe.rs`): manual "Change Path" override → env override (`THEATLAS_FFMPEG_PATH`, `THEATLAS_FFPROBE_PATH`, `THEATLAS_YTDLP_PATH`) → app-managed dir under `app_local_data_dir()` → system `PATH`. Managed installs are SHA-256 verified against the upstream manifest before being accepted.

**What that verification does and does not buy** (`core/tools/verify.rs` says it at length): the artifact and its checksum come from the same GitHub release, so it defeats corruption and a hostile mirror but not a compromised release. Both upstreams publish under a rolling `latest` tag, so trust-on-first-use would fire on every legitimate update — `installed_artifacts.json` is therefore an audit trail, not a gate. Pinning tags is the real fix and is not done.

### Preferences

`core/store/kv.rs` is a namespaced JSON KV store: atomic writes (temp + rename), one debounced writer task, and strict namespace/key validation because a namespace becomes a file name. Reached from the frontend through `src/lib/prefs-env.ts` and `src/hooks/use-pref.ts`, which layers it onto the P0 optimistic primitives — a toggle paints on click and reverts with a toast if the write is refused.

### Linux/Wayland

`src-tauri/src/main.rs` sets `WEBKIT_DISABLE_COMPOSITING_MODE` / `WEBKIT_DISABLE_DMABUF_RENDERER`, and `lib.rs` sets `__NV_DISABLE_EXPLICIT_SYNC`, to avoid compositor deadlocks. Window position/maximize are no-ops on Wayland by design (`getWindowCapabilities`). Don't remove these as dead code.

## Adding a page

```bash
bun run scaffold youtube/download/audio            # normal document page
bun run scaffold youtube/download/audio --variant=center   # centred single-input page
```

That writes `layout.tsx`, `page.tsx`, `data.ts`, `functions.ts`, `types.ts` into the
right route group with the verification stamp filled in, and appends a nav entry to
the matching `src/registry/nav/*.ts` if the registry does not know the route yet.
Give the new entry an icon and a shortcut by hand — the generator cannot guess those.

A **page unit** is `layout.tsx` (a `createPageLayout()` call — variants `page`,
`center`, `flush`), `page.tsx` (composition only, usually wrapping `PageShell`), and
optional `data.ts` / `functions.ts` / `types.ts`. A **component unit** is a folder
with `index.tsx` holding JSX and hooks only, plus the same optional trio. If it is a
pure function or a literal config table, it does not belong in `index.tsx`.

## What is actually implemented

`src/registry/nav/` declares 105 entries covering ~82 routes. **Five are real pages**:
`/`, `/youtube/download`, `/youtube/download/video`, `/settings/dependencies`, `/404`.
The other 77 are two-file `PlannedFeature` stubs — the sidebar is a product map, and a
`status: "planned"` entry renders an honest "not built yet" screen instead of a 404.
Turning a stub into a real page means re-running the scaffolder with `--force` and
flipping its registry `status` to `"ready"`.

Likewise, these are empty or stub placeholders for the in-progress media layer, not working code: `src-tauri/src/commands/youtube.rs` (empty), `src/hooks/use-api.ts` (empty), `src-tauri/src/commands/model.rs` (two `#[allow(dead_code)]` structs).

The KV store and `use-pref` are built and tested but **nothing in the UI uses them yet** — they exist for the media layer and for the optimistic components from P0.

## Hard constraints (enforced by eslint + scripts/*.sh)

1. **Static export only** — no `next/headers`, `next/server`, `"use server"`, `export const dynamic|revalidate|fetchCache`, `unstable_after`, `middleware.ts`, `getServerSideProps`/`getStaticProps`. There is no server.
2. **No `next/router`** — `next/navigation` only.
3. **No `<Image>`** at all in frontend dirs (images are globally `unoptimized`) — use plain `<img>`.
4. **Tauri v2 only** — no `tauri::api::` (Rust) or `@tauri-apps/api/tauri` (JS) v1 leftovers.
5. **Never import from `src-tauri/` in TS** — go through the `src/lib/*-env.ts` wrappers.
6. **Animation: GPU properties only** — animate `transform`/`opacity`; never `transition-all` or transitions on width/height/top/left/padding/margin. RAF loops must drive refs, not `useState`.
7. **Every `.tsx` under `src/app/` or `src/layout/`** must contain the verification stamp `// next@16.2.9 — verified against node_modules/next/dist/docs/<path>.md on <date>`. The check only tests for presence anywhere in the file, but convention is line 1 — copy the exact format from a neighbouring file.
8. **`src/components/ui/` stays flat** — no subdirectories. The shadcn CLI owns that tree and can overwrite it, taking anything of ours with it. `check-structure.sh` refuses subdirectories outright.
9. **Every `page.tsx` has a sibling `layout.tsx`; every `status: "ready"` nav entry resolves to a real page; every real page appears in the registry.** Enforced by `check-structure.sh`, which also runs `validateRegistry()` — `next build` skips it, since it only fires when `NODE_ENV !== "production"`.
10. **`commands/` stays thin, `core/` stays Tauri-free.** Logic in a `#[tauri::command]` cannot be tested without a runtime; a `tauri::` import in `core/` is what makes that happen. `clippy::unwrap_used`/`expect_used`/`panic` are denied across `commands/`.
11. **`unsafe` only in `src-tauri/src/sys/`.** The crate root is `#![deny(unsafe_code)]`; `sys/` carries the single `#[allow]`, with a `// SAFETY:` note. `deny` rather than `forbid` exists precisely so that one exception is possible — do not "tidy" it to `forbid` without deleting the FFI.
12. **No `panic = "abort"` in `[profile.release]`.** It would shrink the binary but turns any panic in a webview-reachable command into a whole-app crash.

## Known gaps — don't chase these

- `eslint.config.mjs` and the check scripts reference `plans/02_AGENTS_PLAN.md`, `plans/04_SKILL_PLAN.md`, `plans/07_ANIMATION_PLAN.md`, `ANIMATION.md`, and `docs/known-issues.md`. **None of these exist.** The scripts themselves are the current source of truth.
- `src/components/ui/**` and `src/hooks/use-mobile.ts` are warn-only (not error) for `no-restricted-syntax`, `react-hooks/set-state-in-effect`, and `no-explicit-any`. Leave as-is outside a dedicated cleanup pass.
- `cargo deny` warns about ~30 duplicate crate versions and several unmaintained transitive crates (the GTK3 bindings and the `unic-*` family). Both reach the tree through Tauri and cannot be resolved from this side; `unmaintained = "workspace"` scopes the hard failure to crates this project depends on directly.
- Install progress is still one global `install-progress` event filtered client-side by tool name. `Rust-Tauri/06` prescribes scoped `progress:{job_id}` events; that matters for the concurrent download queue, not for two sequential bundle installs. Flagged, not done.

## Workflow

- Keep this file lean; use on-demand docs (`docs/`) for deep dives instead of expanding it.
- Split Rust and TypeScript work into separate sessions where practical.
- Use `rg` (ripgrep) for finding strings/symbols — the guard scripts require it on PATH anyway.
