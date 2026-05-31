# Documentation Changelog

Architectural decisions and material edits to documents under `documentation/`. See `docs/adr/` for the longer-form rationale.

## 2026-05-31 — Rust toolchain bumped to 1.89

Tauri 2.11's transitive dep tree requires a higher MSRV than
Tauri itself documents:
  - edition2024 feature (dlopen2_derive) → Rust ≥ 1.85
  - icu_* crates                        → Rust ≥ 1.86
  - zbus, zvariant                      → Rust ≥ 1.87
  - darling, serde_with, time, plist    → Rust ≥ 1.88

Original pin of 1.80 (from SKILL.md's "Rust 1.80+" general
floor) could not resolve the tree. Bumped first to 1.85 — still
failed on the higher-MSRV crates. Bumped to 1.89 for one-minor
headroom over the actual 1.88 minimum.

This is a transitive-MSRV drift problem, not a Tauri requirement
change. Expect to bump again when the dep tree moves.
## 2026-05-31 — Pivot to the boul2gom `yt-dlp` Rust crate

**ADR:** [`docs/adr/ADR-005-yt-dlp-crate-pivot.md`](../docs/adr/ADR-005-yt-dlp-crate-pivot.md)

### Why
Real-world download speed using `rusty_ytdl` (pure Rust, the earlier choice in Plan 05) was unacceptable. After verification, the boul2gom `yt-dlp` crate (v2.7.x) was chosen because it:

- Auto-installs `yt-dlp` and `ffmpeg` via `LibraryInstaller`.
- Uses `yt-dlp` **only for metadata** (`--dump-json`); the actual download runs on native reqwest with parallel segmentation.
- Documents **2–4× (up to ~10× in some scenarios) speedup** over raw `yt-dlp` CLI.
- Delegates muxing and post-processing to the installed ffmpeg internally.
- Exposes Rust hooks (`hooks` feature) for typed progress events.

### What changed in this folder
- **`YT_DLP_RUST_BACKEND.md`**
  - Added revision-history block at top.
  - Reworded the integration model to name the chosen crate and acknowledge it shells out to `yt-dlp` for metadata only.
  - Reworded the ffmpeg paragraph: the crate manages and invokes ffmpeg; we surface diagnostics + update via `get_diagnostics` / `update_yt_dlp` Tauri commands; we do not invoke ffmpeg ourselves in v0.1.
  - Phase 1 step 1 now records the concrete crate + feature set.
- **`RUST_MEDIA_PROCESSING_ALTERNATIVES.md`**
  - Added a revision banner at top noting that the crate now owns the production ffmpeg path, narrowing this doc to "supplementary tools" scope (in practice: `lofty` in v0.1; `ffmpeg-sidecar` reuse + `symphonia` deferred to v0.2).

### What changed in plans
- **`plans/05_YT_DLP_RUST_BACKEND_PLAN.md`** — rewritten end-to-end.
- **`plans/06_RUST_MEDIA_PROCESSING_PLAN.md`** — rewritten and shrunk substantially.
- **`plans/README.md`** — D1 and D3 rewritten.

### Implementation impact
- `src-tauri/Cargo.toml` will add `yt-dlp = "2.7"` (specific features in Plan 05 §5) and `lofty = "0.23"`. It will **not** add `ffmpeg-sidecar` or `rusty_ytdl` in v0.1.
- `src-tauri/capabilities/default.json` will **not** include any `shell:allow-execute` block.
- `tauri.conf.json` will **not** include `bundle.externalBin` entries for `yt-dlp` or `ffmpeg`.

### Escape hatch
A raw-CLI extractor remains available behind the off-by-default Cargo feature `extractor-cli` for environments that prohibit runtime binary downloads (corporate proxies, air-gapped installs). It is not built into shipped binaries by default.

### Review trigger
The pivot is revisited if Phase 1 measurements don't show meaningful real-world speedup (Plan 05 §18 acceptance: 720p YouTube ≤ 3 s on a 50 Mbps Linux CI runner). See ADR-005 §9 for the full trigger list.

## 2026-05-31 — Empty root /app/ directory + render-menu-item transition-all cleanup

Two leftover issues from Mission 0.2:

1. The ESLint self-test created app/__lint_test__.tsx at the repo
   root. The file was deleted but the directory was not. Next.js 16
   prefers app/ at the root over src/app/ when both exist; the empty
   app/ shadowed our home page in src/app/(home)/page.tsx and served
   404. Fix: `rmdir app`. Guardrail added to scripts/check-agents-rules.sh.

2. src/layout/sidebar/render-menu-item.tsx still had 3 uses of
   transition-all that were missed in the earlier cleanup. Replaced
   with explicit transition-transform (chevrons) and
   transition-[transform,opacity] (sub-items per ANIMATION.md §1
   Rule 1). No behavior change.

3. The Mission 0.2d initial fix used `transition-[transform,opacity]`
   for the sub-item entrance, which Tailwind v4 silently runs at 0s
   duration (no visible animation). Replaced with bare `transition`
   which covers transform + opacity correctly. Gotcha documented in
   ANIMATION.md §3 R1, plans/07 §3, and the animation contract KB
   file for future agents.
