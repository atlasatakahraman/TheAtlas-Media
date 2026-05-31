# ADR-005 — Pivot to the boul2gom `yt-dlp` Rust crate

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Atlas Ata Kahraman (owner) + agent
- **Supersedes:** the `rusty_ytdl` choice in the initial draft of Plan 05; the standalone `ffmpeg-sidecar` strategy in the initial draft of Plan 06.
- **Related:** [`plans/05_YT_DLP_RUST_BACKEND_PLAN.md`](../../plans/05_YT_DLP_RUST_BACKEND_PLAN.md), [`plans/06_RUST_MEDIA_PROCESSING_PLAN.md`](../../plans/06_RUST_MEDIA_PROCESSING_PLAN.md), [`documentation/YT_DLP_RUST_BACKEND.md`](../../documentation/YT_DLP_RUST_BACKEND.md).

---

## 1. Context

The original `documentation/YT_DLP_RUST_BACKEND.md` set two architectural rules that interacted badly:

1. **"Avoid shelling out to the `yt-dlp` executable for normal downloads."**
2. **"Use a Rust-native yt-dlp-compatible library inside the backend."**

The initial draft of Plan 05 satisfied (1) by picking `rusty_ytdl` (pure Rust, no external binary). During hands-on testing the owner reported that download **speed was unacceptably slow** with this approach. The slowness was specifically in the download phase, not metadata extraction.

The choice space was reopened.

## 2. Decision

Adopt the **boul2gom `yt-dlp` crate (v2.7.x)** as the default and only extractor in the shipped build.

This is a Rust crate that:

- **Automatically installs** the `yt-dlp` and `ffmpeg` binaries on first use (`LibraryInstaller::install_youtube()` / `install_ffmpeg()`).
- Uses `yt-dlp` **only for metadata extraction** (`--dump-json`) — *not* for the bytes-on-the-wire phase.
- Performs the **actual download via a native Rust HTTP client (`reqwest`) with parallel segmentation**, which the crate documents as **2–4× faster than raw yt-dlp**.
- Delegates **post-processing (mux, chapter embed, precision trim) to the installed ffmpeg**, using stream copy when possible to avoid re-encoding.
- Exposes Rust hooks (`hooks` feature) so we can stream typed progress events out instead of parsing CLI stderr.

A raw-CLI escape hatch (`extractor-cli` Cargo feature, off by default) remains for environments that prohibit runtime binary downloads (corporate proxies, air-gapped installs).

`ffmpeg-sidecar` is *not* added as a v0.1 dependency. If/when the app needs user-driven custom re-encode workflows in v0.2+, we will reuse the **same ffmpeg binary** that the `yt-dlp` crate installed, calling it via `ffmpeg-sidecar`.

## 3. Why this satisfies the original constraints

| Original rule | How the crate satisfies it |
|---|---|
| "Avoid shelling out to `yt-dlp` for normal downloads." | The crate calls `yt-dlp` **only for `--dump-json`** metadata extraction. The actual download is native Rust HTTP. From the architecture viewpoint, the "download" is Rust-native; yt-dlp is reduced to a metadata oracle. |
| "Use a Rust-native yt-dlp-compatible library." | The crate **is** that library — published on crates.io, type-safe Rust API, hooks/events, cancellation surface. |
| "Stream structured progress events." | The `hooks` feature delivers Rust callbacks; we forward them to Tauri `ipc::Channel<DownloadEvent>`. |
| "Keep the library behind a trait so it can be swapped." | Plan 05 §7 keeps the `ExtractorBackend` trait. The crate is one concrete impl (`YtDlpCrateExtractor`); the CLI feature is a second (`CliExtractor`). |
| "Avoid raw `yt-dlp` flags from the UI." | Our `FormatPreset` enum maps to the crate's own `extractor::Youtube` preset enum. The UI never sees yt-dlp flags. |
| "Avoid arbitrary plugin/script loading." | The crate doesn't expose plugin loading. yt-dlp's own plugin system isn't surfaced. |

## 4. Performance evidence

From the crate's published benchmarks on docs.rs (`yt-dlp` v2.7.2):

| Scenario | Raw `yt-dlp` CLI | Crate (Balanced profile) | Speedup |
|---|---|---|---|
| Native 720p mp4 (no ffmpeg) | ~20.7 s | ~2.10 s | **~9.9×** |
| Muxed 480p (with ffmpeg) | ~9.41 s | ~3.48 s | ~2.7× |
| Muxed 720p (with ffmpeg) | ~10.4 s | ~4.92 s | ~2.1× |
| Muxed 1080p (with ffmpeg) | ~18.3 s | ~10.5 s | ~1.7× |
| Best quality muxed | ~18.2 s | ~13.7 s | ~1.3× |

The "Aggressive" speed profile shaves more time but is meant for ≥ 500 Mbps links; we'll default to "Balanced" and let users opt up in settings.

We will **re-measure** on our CI runners after Phase 1 implementation lands. If our measurements don't approach these published numbers (within 30 %), the pivot is reopened — perf was the entire reason for it.

## 5. Tradeoffs (honest list)

### Pros
- **Single dependency surface** for yt-dlp + ffmpeg + downloader engine.
- **Documented 2–10× faster** than raw yt-dlp CLI.
- **No manual binary bundling** (Tauri `externalBin` / per-target-triple files / `build.rs` download scripts) for the default acquisition path.
- **No `tauri-plugin-shell` / no `shell:allow-execute`** capability — smaller attack surface than either the CLI sidecar or the `ffmpeg-sidecar` plan.
- Built-in **caching** (`cache-memory` default, optional persistent backends), **statistics**, **observability via `tracing`**, **hooks**.
- The crate releases **every ~2 weeks** so yt-dlp site-extractor patches arrive quickly.

### Cons
- **Heavier compile time** (~30+ transitive deps) than `rusty_ytdl` or wrapping the CLI ourselves. We mitigate with `default-features = false` + minimal feature set (Plan 05 §5).
- **First-launch internet requirement** (the crate downloads ~30 MB of binaries on init). Mitigated by visible setup wizard (Plan 05 §11) and the `extractor-cli` escape hatch.
- **No per-download `cancel(id)` API** in the crate yet — we cancel by dropping the future via `tokio::select!`. Latency to actual stop ≤ one segment fetch (~< 1 s). Acceptable for v0.1; we'll consider upstreaming a PR.
- **License complexity** for the bundled ffmpeg binary (LGPL) — handled in Plan 08.
- **Trust in a single upstream maintainer** (boul2gom). The `ExtractorBackend` trait keeps us insurable: `CliExtractor` is a working fallback if the crate ever stalls.

## 6. Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| `rusty_ytdl` (pure Rust) | Real-world download speed reported by owner was too slow. YouTube-only. |
| `youtube_dl` crate (wraps CLI sequentially) | Slower than (boul2gom) yt-dlp crate because no parallel segmentation. |
| Raw `yt-dlp` CLI as Tauri sidecar (with `--progress-template`) | Slower than (boul2gom) crate for the same reason; more capability/IPC surface. Kept as opt-in `extractor-cli` feature. |
| `ffmpeg-next` (C bindings) | Heavy packaging, no benefit over invoking the binary that yt-dlp crate installs. |
| `gstreamer` | Out of proportion for a downloader. |
| Bundle our own static yt-dlp + ffmpeg via `build.rs` | Duplicates what the crate already does; we still want auto-update via `Downloader::update_downloader()`. |

## 7. Migration / implementation impact

- **`plans/05_YT_DLP_RUST_BACKEND_PLAN.md`** — rewritten end-to-end. Replaces `rusty_ytdl` references; adds `binaries::resolve` tiered acquisition; adds `setup_extractor` IPC; adds `update_yt_dlp` command; collapses capabilities (removes `shell:allow-execute`).
- **`plans/06_RUST_MEDIA_PROCESSING_PLAN.md`** — rewritten and **substantially shrunk**. No `MediaProcessor` trait, no separate `Ffmpeg*` impls, no `ffmpeg-sidecar` v0.1 dep, no custom `build.rs` ffmpeg fetcher. Only `lofty` for post-download tagging.
- **`plans/README.md`** — D1 and D3 rewritten; D2 unchanged.
- **`documentation/YT_DLP_RUST_BACKEND.md`** — updated to reflect the new "crate manages yt-dlp + ffmpeg" reality. CHANGELOG entry recorded.
- **`src-tauri/Cargo.toml`** — adds `yt-dlp = "2.7"` with the feature set in Plan 05 §5. Drops planned `ffmpeg-sidecar` dep.
- **`src-tauri/capabilities/default.json`** — removes `shell:allow-execute` block entirely.
- **`tauri.conf.json`** — removes `bundle.externalBin` entries for `binaries/yt-dlp` and `binaries/ffmpeg`.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Real-world speed doesn't match the crate's published benchmarks | Phase 1 acceptance criterion (Plan 05 §18): 720p YouTube download ≤ 3 s on a 50 Mbps Linux CI runner. Failing that → re-evaluate. |
| Crate stalls or breaks on a YouTube change | `ExtractorBackend` trait + `extractor-cli` opt-in. We can ship "use system yt-dlp" as a setting toggle in 1 PR. |
| First-run binary download fails (corporate proxy, no internet) | Setup wizard surfaces error + manual download instructions + the `extractor-cli` setting to point at a user-provided binary. |
| ffmpeg variant ends up GPL instead of LGPL | Plan 06 §12 acceptance: build hard-errors on `gpl`. Plan 08 §7 enumerates compliance. |
| Bundle bloat from heavy default features | We pin `default-features = false` and enable only `cache-memory`, `hooks`, `statistics`, `rustls`, `hickory-dns` (Plan 05 §5). |

## 9. Decision review trigger

Revisit this ADR if **any** of:

1. Phase 1 measurements show no meaningful speedup over `rusty_ytdl` or raw CLI.
2. The crate goes unmaintained (> 90 days without a release).
3. A YouTube change breaks the crate for > 2 weeks while raw `yt-dlp` is patched and working.
4. Tauri / Rust packaging changes make in-binary ffmpeg bundling materially easier than runtime install.
