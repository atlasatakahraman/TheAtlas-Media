# Plan 01 — GOAL.md → Product & Architectural Anchors

> **Source:** `documentation/GOAL.md`
> **Status:** Authoritative scope contract. Every other plan must be consistent with this one.

---

## 1. Restated mission (in one sentence)

Build a **high-performance desktop app** for downloading, extracting, and converting media, where **Rust owns all process-heavy work** and **React owns only UI state**, with **structured streaming progress** between them and **no shell interpolation** of user input.

## 2. What "done" looks like (success criteria → measurable tests)

| `GOAL.md` criterion | Concrete acceptance test |
|---|---|
| "Users can start, monitor, complete, fail, and cancel downloads." | E2E test: submit URL → see `Resolving → Downloading → Merging → Complete` events → assert file exists at canonicalized path. Repeat with `Cancel` mid-download → assert `Cancelled` terminal event and partial file removed (or `.part` cleaned per preset). |
| "The backend controls command arguments, output paths, and dependency detection." | Code review: zero call sites pass user-provided strings as CLI flags. `ripgrep "args(\[" src-tauri/` returns only static or preset-derived values. |
| "Frontend remains responsive while multiple downloads are active." | Profiling test: 5 concurrent downloads emitting 20 progress events/s each → React DevTools Profiler shows < 4 ms per commit on `DownloadQueueItem`, layout shell does not re-render. |
| "Avoids shell interpolation and raw `yt-dlp` flags." | Linter rule (custom clippy lint or grep CI step): no `Command::new` with concatenated user strings; `ExtractorBackend` trait is the only public surface. |
| "Documentation and implementation stay aligned with `YT_DLP_RUST_BACKEND.md`." | This is enforced by Plan 05; CI step diffs the public IPC surface against the API table in Plan 05 §"Tauri commands". |

## 3. Primary goals → architectural commitments

| Goal | Commitment | Plan ref |
|---|---|---|
| "Rust backend for process-heavy work" | All long-running work runs in `tokio::spawn` tasks owned by `DownloadManager`. No `std::thread::sleep`, no blocking I/O on the main runtime. | Plan 05 §4 |
| "Integrate `yt-dlp` safely as a managed backend process" | **Rust-native extractor crate** behind `ExtractorBackend` trait — `YT_DLP_RUST_BACKEND.md` overrides the older "spawn the CLI" reading of this sentence. CLI sidecar is reserved for FFmpeg only (Plan 06). | Plan 05 §3 |
| "Keep React responsive by streaming structured progress" | Use Tauri 2 **`ipc::Channel<DownloadEvent>`** (ordered, no JS-eval) over `Emitter::emit`. Throttle to ≤ 10 events/s/download. | Plan 03 §IPC; Plan 05 §6 |
| "Follow current React rendering performance guidance" | No top-level provider for progress state. Memoize only after Profiler shows ≥ 1 ms cost. Animations follow `ANIMATION.md` (Plan 07). | Plan 07; Plan 05 §"React frontend architecture" |
| "Clear user-facing errors" | Typed `CommandError` enum with 8+ variants (per `YT_DLP_RUST_BACKEND.md` §"Error handling"); React maps enum → localized copy. | Plan 05 §"Error handling" |

## 4. Non-functional NFRs derived from "high-performance desktop app"

| NFR | Target | How we measure |
|---|---|---|
| Cold start (window visible) | ≤ 1.5 s on a 2020 MacBook Air | `tauri dev` → window `created` → `webview-ready` log timestamps |
| URL → first metadata event | ≤ 800 ms p50 for a YouTube video | Instrument `start_download` with `tracing` spans |
| Progress event commit cost | ≤ 4 ms p95 in React Profiler | DevTools Profiler, scripted scenario |
| Idle CPU with 0 downloads | ≤ 0.5 % | `ps -o %cpu` over 60 s, app focused |
| Idle CPU with 1 active download | ≤ 5 % outside of ffmpeg | Same, minus ffmpeg child |
| Memory after 10 sequential downloads | ≤ 250 MB RSS | `ps -o rss` after GC pause |
| Bundle size (Next.js client) | ≤ 200 KB gzipped | `next build` output |
| Binary size (Tauri release) | ≤ 25 MB without FFmpeg, ≤ 90 MB with bundled FFmpeg | `du -h target/release/bundle/**` |

## 5. Scope guard rails (explicit non-goals)

The following are **out of scope** for v0.1 (deferred or never):

- Browser extension / mobile build (Tauri mobile path not in scope).
- Cloud sync, accounts, telemetry of any kind.
- Plugin marketplace (`YT_DLP_RUST_BACKEND.md` security section: "Avoid arbitrary plugin/script loading unless explicitly reviewed").
- Live streaming / DVR recording.
- Built-in player (use OS default via `tauri-plugin-opener`).
- Allowing the user to type raw yt-dlp flags. **Ever.** (Goal: "avoids shell interpolation and raw `yt-dlp` flags.")

If a feature request appears that crosses one of these lines, escalate per `CLAUDE.md` "Decisions Requiring Human Review".

## 6. Risks & mitigations (derived from goals)

| Risk | Source | Mitigation |
|---|---|---|
| Rust-native yt-dlp crate becomes unmaintained or breaks on a major site change | Goal #2 puts us behind a single Rust crate | `ExtractorBackend` trait isolates the dependency; document a "swap procedure" in Plan 05 §"Trait boundary". Optional FFmpeg-sidecar-style escape hatch is **explicitly out of scope** unless rebuilt under the trait. |
| React shell re-renders on every progress tick → jank with concurrent downloads | Goal #3 | Plan 05 architecture: keep progress state in `DownloadQueueItem`, never above. Plan 07 enforces GPU-only animations. |
| Premature memoization noise (the team adds `useMemo` everywhere "to be safe") | Goal #4 explicitly calls this out | PR review rubric requires a screenshot of React DevTools Profiler before/after for any new `memo` / `useMemo` / `useCallback`. |
| User pastes a malicious URL that triggers extractor RCE | Goal #5 "avoids shell interpolation" | URL validated via `url::Url::parse` + scheme allowlist (`https`, `http`) before reaching extractor. Canonicalize output dir. Reject paths outside it. Plan 05 §"Security". |

## 7. Out-of-the-box stack tie-in

Confirmed from `package.json`, `next.config.ts`, and the doc set:

- **Framework**: Next.js 16.2.6 + React 19.2.4 + TypeScript ≥ 5.
- **Build**: `output: "export"` (mandatory for Tauri webview, already set).
- **Theming/UI**: shadcn 4.8 + Tailwind v4 + Base UI + Radix + `tw-animate-css` (per `globals.css`).
- **Backend**: Tauri 2.11 (CLI + API), Rust ≥ 1.89.
- **Single user-facing dependency surface**: `@tauri-apps/api` `invoke` + `Channel` + `event.listen`. No direct child-process APIs on the JS side.

## 8. Execution checklist (lift into tracker)

- [ ] **G-1** Create `documentation/CHANGELOG.md` and log every architectural change here (forces drift detection).
- [ ] **G-2** Add an `src/src/app/about/page.tsx` that surfaces version + AAKNCL attribution (Plan 08 owns the copy).
- [ ] **G-3** Add `npm run check` script that runs `tsc --noEmit`, `eslint`, `cargo fmt --check`, `cargo clippy -- -D warnings`. Wire into pre-commit.
- [ ] **G-4** Add `npm run measure` that boots the app, runs a scripted download, and prints the 7 NFR numbers in §4 to console — first as a smoke harness, later as CI.
- [ ] **G-5** Add CODEOWNERS + PR template asking the three GOAL questions: *Does this keep React responsive? Does this keep Rust as the only process owner? Does this avoid raw yt-dlp flags?*
- [ ] **G-6** Stand up CI matrix: ubuntu-latest, macos-14, windows-latest. Run `pnpm tauri build` on each, archive bundles as artifacts.
- [ ] **G-7** Open an "Architecture Decision Records" folder (`docs/adr/`) and seed it with ADR-001 "Rust-native extractor over CLI sidecar" pointing at Plan 05.

## 9. Acceptance criteria for this plan

This plan is considered satisfied when:

1. All 7 checklist items above are closed.
2. The 7 NFR targets in §4 are measured at least once with results recorded in `docs/perf/baseline.md`.
3. Every other plan in `plans/` cross-links back here as its anchor.
