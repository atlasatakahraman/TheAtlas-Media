# Locked architectural decisions (D1–D11)

These are the only legitimate justifications for changes to `src-tauri/` or `src/app/`. Cite the D-number in every Plan artifact.

- **D1** — Use the boul2gom `yt-dlp` Rust crate (v2.7.x) as the only extractor in shipped builds. It auto-installs `yt-dlp` and `ffmpeg`, performs native parallel-segment HTTP downloads (2–4× faster than raw yt-dlp CLI), and delegates muxing to ffmpeg internally. A raw-CLI escape hatch lives behind the off-by-default `extractor-cli` Cargo feature. Source: ADR-005 + revised `YT_DLP_RUST_BACKEND.md`.
- **D2** — No raw yt-dlp flags from the UI. UI sends `FormatPreset` enum values only.
- **D3** — FFmpeg is managed by the `yt-dlp` crate. No separate `ffmpeg-sidecar` integration in v0.1. Custom re-encode is deferred to v0.2 behind a feature flag and will reuse the crate-installed binary.
- **D4** — No localStorage. No top-level provider for download progress state. Progress lives in `DownloadQueueItem` only.
- **D5** — Animate only `transform` and `opacity`. Height via CSS Grid `0fr ↔ 1fr`. RAF + refs for physics. Never `useState` in animation loops.
- **D6** — Every `#[tauri::command]` returns `Result<T, CommandError>`. No `String` errors.
- **D7** — Single source of truth for IPC types: `src-tauri/src/contracts/` (Rust) → `ts-rs` → `src/lib/api-contracts.gen.ts` (TS). Frontend imports types from the generated file only.
- **D8** — Before writing any `.tsx`, read `node_modules/next/dist/docs/<topic>.md`. Stamp the file with a verification comment dated within 30 days.
- **D9** — AAKNCL attribution must appear in: About page, README, and SPDX-style header on every new source file.
- **D10** — Next.js client bundle ≤ 200 KB gzipped. Enforced in CI.

Changing a D-decision requires editing `plans/README.md` first, then the affected plan(s), then an ADR.
