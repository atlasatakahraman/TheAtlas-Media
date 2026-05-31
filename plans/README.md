# TheAtlas Media — Implementation Plans Index

> **Project:** `theatlas-media` (TheAtlas Media Processing)
> **Stack:** Next.js 16.2.6 · React 19.2.4 · TypeScript 5.x · Tauri 2.11 · Rust 1.89+
> **License:** AAKNCL v1.0 (non-commercial, attribution required)
> **Owner:** Atlas Ata Kahraman (`atlasfirarda`)

This folder contains one execution plan per source document under `documentation/`. Plans are designed to be read in the order below; later plans assume the architectural decisions made by earlier ones.

---

## Read order

| # | Plan | Source doc | Why this order |
|---|------|------------|----------------|
| 1 | [`01_GOAL_PLAN.md`](./01_GOAL_PLAN.md) | `GOAL.md` | Defines product scope and success criteria. Anchors everything else. |
| 2 | [`02_AGENTS_PLAN.md`](./02_AGENTS_PLAN.md) | `AGENTS.md` | Mandatory pre-flight rules — **"this is NOT the Next.js you know"**. Read before touching any `.tsx`. |
| 3 | [`03_CLAUDE_PLAN.md`](./03_CLAUDE_PLAN.md) | `CLAUDE.md` | Provider routing, codegen standards, IPC patterns. Operational rules for *all* agents. |
| 4 | [`04_SKILL_PLAN.md`](./04_SKILL_PLAN.md) | `SKILL.md` | Skill-by-skill checklists and trigger patterns. Day-to-day playbook. |
| 5 | [`05_YT_DLP_RUST_BACKEND_PLAN.md`](./05_YT_DLP_RUST_BACKEND_PLAN.md) | `YT_DLP_RUST_BACKEND.md` | **Critical:** pivots away from CLI-sidecar approach to a **Rust-native extractor behind a trait**. Drives `src-tauri/` layout. |
| 6 | [`06_RUST_MEDIA_PROCESSING_PLAN.md`](./06_RUST_MEDIA_PROCESSING_PLAN.md) | `RUST_MEDIA_PROCESSING_ALTERNATIVES.md` | Companion to #5: `MediaProcessor` trait, FFmpeg via `ffmpeg-sidecar`, narrow Rust-native paths. |
| 7 | [`07_ANIMATION_PLAN.md`](./07_ANIMATION_PLAN.md) | `ANIMATION.md` | Frontend perf contract: GPU-only props, grid height trick, RAF + ref physics, Canvas measurement. |
| 8 | [`08_LICENSE_PLAN.md`](./08_LICENSE_PLAN.md) | `LICENSE.md` | Attribution, headers, third-party license files, FFmpeg/yt-dlp redistribution compliance. |
| 9 | [`09_ANTIGRAVITY_EXECUTION_PLAN.md`](./09_ANTIGRAVITY_EXECUTION_PLAN.md) | (cross-plan) | **Execution playbook for Google Antigravity 2.0 driven by Gemini 3.1 Pro High.** Translates plans 01–08 into Manager Surface subagents, Knowledge Base files, Skills, phase missions, and CI hooks. |

---

## Dependency graph between plans

```
                    ┌──────────────┐
                    │ 01 GOAL      │  ← scope contract
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 ┌────────────┐     ┌────────────┐     ┌────────────┐
 │ 02 AGENTS  │     │ 03 CLAUDE  │     │ 04 SKILL   │
 │ (pre-flight│     │ (rules)    │     │ (playbook) │
 └─────┬──────┘     └──────┬─────┘     └──────┬─────┘
       │                   │                  │
       └─────────┬─────────┴──────────────────┘
                 ▼
   ┌──────────────────────────────────────┐
   │ 05 YT_DLP_RUST_BACKEND               │  ← defines ExtractorBackend trait,
   │   (extractor trait + DownloadService)│    DownloadService, events
   └─────────────────┬────────────────────┘
                     │
                     ▼
   ┌──────────────────────────────────────┐
   │ 06 RUST_MEDIA_PROCESSING             │  ← defines MediaProcessor trait,
   │   (MediaProcessor trait + FFmpeg)    │    consumes ExtractorBackend output
   └─────────────────┬────────────────────┘
                     │
                     ▼
   ┌──────────────────────────────────────┐
   │ 07 ANIMATION                         │  ← frontend rendering contract
   │   (GPU-only, RAF, ref physics)       │
   └─────────────────┬────────────────────┘
                     │
                     ▼
   ┌──────────────────────────────────────┐
   │ 08 LICENSE                           │  ← release-blocking compliance
   └──────────────────────────────────────┘
```

---

## Cross-cutting decisions (locked, do not re-debate)

These decisions are forced by the documentation and are referenced by multiple plans:

| # | Decision | Source | Affected plans |
|---|----------|--------|----------------|
| D1 | **Use the boul2gom `yt-dlp` crate (v2.7.x)** as the only extractor. It auto-installs yt-dlp + ffmpeg via `LibraryInstaller`, uses native reqwest + parallel segments for downloads (2–4× faster than raw yt-dlp CLI), and delegates muxing/post-processing to ffmpeg internally. A raw CLI sidecar path remains behind the off-by-default `extractor-cli` Cargo feature for corporate-network escape hatch use. | `YT_DLP_RUST_BACKEND.md` (revised) + **ADR-005** | 05, 06 |
| D2 | **No raw yt-dlp flags from the UI.** Frontend selects `FormatPreset` enums only, which map internally to the crate's `extractor::Youtube` presets. | `GOAL.md` "Success criteria"; `YT_DLP_RUST_BACKEND.md` §"Format presets" | 05 |
| D3 | **FFmpeg is managed by the `yt-dlp` crate** (installed via `LibraryInstaller::install_ffmpeg`, invoked internally for muxing/post-processing). No separate `ffmpeg-sidecar` integration in v0.1. A future custom-reencode workflow may reuse the same crate-installed binary via `ffmpeg-sidecar` behind a v0.2 feature flag. | `RUST_MEDIA_PROCESSING_ALTERNATIVES.md` (post-pivot) + **ADR-005** | 06 |
| D4 | **No localStorage. No top-level provider for progress state.** Progress lives in the smallest component that renders it. | `CLAUDE.md` "Coordination rules"; `YT_DLP_RUST_BACKEND.md` §"React frontend architecture" | 05, 07 |
| D5 | **Animate only `transform` and `opacity`.** Height via CSS Grid `grid-template-rows: 0fr → 1fr`. RAF + refs for physics, never `useState`. | `ANIMATION.md` Rules 1–4 | 07 |
| D6 | **Typed `Result<T, CommandError>` returns from every `#[tauri::command]`.** No `String` errors. | `CLAUDE.md` "IPC PATTERNS"; `SKILL.md` Skill 7 | 03, 05, 06 |
| D7 | **Single source of truth for IPC types:** `src/lib/api-contracts.ts` (frontend) generated from / mirrored against Rust types in `src-tauri/src/contracts/`. | `CLAUDE.md` "Multi-agent coordination"; `SKILL.md` Skill 5 | 03, 05 |
| D8 | **AGENTS.md rule is mandatory:** before writing any Next.js code, read `node_modules/next/dist/docs/` for the relevant feature. Do not trust training data. | `AGENTS.md` (the whole file) | 02, 07, and all FE work |
| D9 | **Attribution + non-commercial notice** must appear in: About screen, README, source-file headers for substantive new files, any redistributed binary archive. | `LICENSE.md` §3.1 | 08 |
| D10 | **Bundle size budget:** Next.js client bundle ≤ 200 KB gzipped. | `CLAUDE.md` "Coordination rules" | 03, 07 |

---

## Phasing (across all plans)

The plans together describe four delivery phases. Use this when sequencing work in a tracker:

### Phase 0 — Pre-flight (week 1)
- Read `node_modules/next/dist/docs/` for: App Router, `output: "export"`, Server vs Client components, React 19 hooks (`use`, `useOptimistic`, `useTransition`), React Compiler status.
- Verify `package.json` deps boot: `pnpm i && pnpm tauri:dev` runs an empty window.
- Lock Rust toolchain: `rust-toolchain.toml` pinning ≥ 1.80.
- Scaffold workspace layout (see Plan 05).

### Phase 1 — Backend foundation (weeks 2–3)
- `ExtractorBackend` trait + first concrete impl (Plan 05).
- `MediaProcessor` trait + `FfmpegMediaProcessor` (Plan 06).
- `DownloadService` + `DownloadManager` + `start_download` / `cancel_download` commands.
- Typed `CommandError` + event taxonomy.

### Phase 2 — Frontend queue UI (weeks 3–4)
- `DownloadForm`, `DownloadQueue`, `DownloadQueueItem` (Plan 05).
- Channel-based progress wiring (Plan 03).
- Theme + global layout from `globals.css`, branding from `TheAtlas{B,W}2048.png`.

### Phase 3 — Polish & perf (week 5)
- ANIMATION.md compliance pass (Plan 07): GPU-only, grid trick, RAF physics for the search/cursor work.
- Profile with React DevTools + `cargo flamegraph`.
- Bundle audit (`ANALYZE=true next build`).

### Phase 4 — Packaging & release (week 6)
- FFmpeg binary acquisition + license file (Plan 08).
- Attribution notice in About modal (Plan 08).
- `cargo audit` / `npm audit` clean (Plan 03 §security).
- Cross-platform packaging (`tauri build` on Linux/macOS/Windows).

---

## How to use these plans

1. **Reading:** start with Plan 01, then walk down in order on first contact.
2. **Implementing:** each plan ends with a numbered checklist (`§ Execution checklist`). Lift items into your tracker verbatim.
3. **Changing scope:** if a decision in the "locked decisions" table needs to change, edit *this* file first, then update the affected plan(s). Do not let plans drift.
4. **Reviewing PRs:** the "Acceptance criteria" section of each plan is the PR review rubric for work scoped to that plan.

---

*Generated 2026-05-31 from `documentation/*.md` at repo state shown by `ls`.*
