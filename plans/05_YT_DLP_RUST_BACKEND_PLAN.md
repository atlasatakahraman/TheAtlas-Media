# Plan 05 — YT_DLP_RUST_BACKEND.md → `yt-dlp` Rust Crate Integration

> **Source:** `documentation/YT_DLP_RUST_BACKEND.md` (post-revision; see ADR-005)
> **Status:** **Supersedes** the earlier `IMPLEMENTATION_PLAN.md` at repo root and the previous `rusty_ytdl` choice.
> **Companion ADR:** `docs/adr/ADR-005-yt-dlp-crate-pivot.md`

This plan implements the download backend using the **boul2gom `yt-dlp`** crate (v2.7.x). The crate handles binary acquisition, native parallel-segment HTTP downloads, and ffmpeg orchestration — and is documented to be **2–4× faster than raw `yt-dlp`** because it uses yt-dlp only for metadata (`--dump-json`) while performing actual downloads through a native Rust HTTP client with parallel segmentation.

---

## 1. Why this crate (and not the alternatives)

| Option | Decision | Reason |
|---|---|---|
| **`yt-dlp` crate (boul2gom v2.7.x)** | ✅ **Chosen** | Auto-installs yt-dlp + ffmpeg via `LibraryInstaller`. Native reqwest + parallel segments → **2–4× faster than raw yt-dlp CLI**. Active (releases every ~2 weeks). Built-in cache layer, format presets, hooks, statistics. Bundles ffmpeg orchestration so we don't need a separate sidecar. |
| `rusty_ytdl` (pure Rust) | ❌ Rejected | Real-world download speed was unacceptable. Pure-Rust YouTube-only. |
| `youtube_dl` crate | ❌ Rejected | Wraps the CLI sequentially; slower than (1). |
| Raw `yt-dlp` CLI as Tauri sidecar | ❌ Rejected as default | Slower than (1) because of sequential download. Kept as **opt-in `extractor-cli` feature** for users on corp networks that block runtime binary downloads. |
| `ffmpeg-sidecar` (separate) | ❌ Replaced | The `yt-dlp` crate already manages ffmpeg installation and invocation. One dependency surface instead of two. |

The crate still uses `yt-dlp` (the Python tool) under the hood for **metadata only** — but downloads bypass it. So "yt-dlp" appears nowhere in the user-visible architecture except as a managed dependency the crate fetches automatically.

## 2. Binary management — handled by the crate

`yt-dlp::client::deps::LibraryInstaller` and `Downloader::with_new_binaries(executables_dir, output_dir)` handle:

- Downloading the correct `yt-dlp` binary for the host OS+arch (Windows, macOS, Linux x86_64/aarch64).
- Downloading a matching static `ffmpeg` build.
- Storing both under a directory we choose.
- Updating yt-dlp via `Downloader::update_downloader()`.

### 2.1 Acquisition strategy (which directory)

We use a **tiered resolution** at startup inside our `DownloadService::init`:

```
1. App-data dir  →  $APPDATA/TheAtlas/bin/{yt-dlp,ffmpeg}
                    Created on first launch via LibraryInstaller.
                    Survives app updates. User-writable for self-update.
2. System PATH    → If $APPDATA install fails (sandbox, offline) and
                    `which yt-dlp` + `which ffmpeg` succeed, fall back.
3. Fail visibly   → Surface a one-time "Setup" wizard if neither works,
                    with a manual download link.
```

Implementation:

```rust
// src-tauri/src/download/binaries.rs
use yt_dlp::client::deps::{Libraries, LibraryInstaller};
use std::path::{Path, PathBuf};

pub struct ResolvedBinaries {
    pub libs: Libraries,        // what the crate consumes
    pub source: BinarySource,   // for diagnostics UI
    pub yt_dlp_version: String,
    pub ffmpeg_version: String,
}

pub enum BinarySource { AppData(PathBuf), System }

pub async fn resolve(app_data: &Path, sink: &SetupSink) -> Result<ResolvedBinaries, SetupError> {
    let bin_dir = app_data.join("bin");
    let yt_dlp_path = bin_dir.join(yt_dlp_exe_name());
    let ffmpeg_path = bin_dir.join(ffmpeg_exe_name());

    if !yt_dlp_path.exists() || !ffmpeg_path.exists() {
        sink.emit(SetupEvent::DownloadingDependencies);
        let installer = LibraryInstaller::new(bin_dir.clone());
        installer.install_youtube(None).await.map_err(SetupError::install)?;
        installer.install_ffmpeg(None).await.map_err(SetupError::install)?;
    }
    let libs = Libraries::new(yt_dlp_path.clone(), ffmpeg_path.clone());
    Ok(ResolvedBinaries {
        libs,
        source: BinarySource::AppData(bin_dir),
        yt_dlp_version: probe_version(&yt_dlp_path).await?,
        ffmpeg_version: probe_version(&ffmpeg_path).await?,
    })
}
```

The crate's `Downloader::with_new_binaries(...)` is convenient for one-shot installs but we want the tiered fallback + visible progress, so we drive `LibraryInstaller` directly.

### 2.2 Self-update

Expose `update_yt_dlp` command that calls `Downloader::update_downloader().await`. UI surfaces this in `src/app/settings/diagnostics/page.tsx`. Default: run automatically once per week on app start (background task; no blocking).

### 2.3 Offline / corporate-network escape hatch

Behind Cargo feature `extractor-cli`:
- Skip `LibraryInstaller`.
- Expect `yt-dlp(.exe)` and `ffmpeg(.exe)` to live in a directory the user picks under Settings → "Use system binaries".
- Validate they're executable and respond to `--version`.

This is OFF in release builds by default. ADR-005 lists the trigger to enable it.

## 3. Architectural rules (unchanged from doc)

The doc's architectural rules still hold — only the *concrete extractor implementation* changed:

1. **Rust owns extraction and download.** The frontend calls Tauri commands; it never invokes yt-dlp directly.
2. **App-defined `FormatPreset` enum.** The UI never sends raw yt-dlp flags. (The crate exposes its own `extractor::Youtube` format presets — `Best`, `Premium`, `High`, `Medium`, `Low`, `AudioOnly`, `ModernCodecs` — which we map *to* in `presets.rs`.)
3. **`ExtractorBackend` trait** wraps the crate so a future swap stays cheap.
4. **Canonicalize output paths** and jail-within the chosen directory.
5. **One terminal event per download.** Streamed via Tauri 2 `ipc::Channel`.

## 4. Module layout

```
src-tauri/src/
├─ main.rs                 // bootstrap
├─ lib.rs                  // tauri::Builder, plugin registration, RunEvent
├─ contracts/              // shared serde types (ts-rs)
│   ├─ mod.rs
│   ├─ download.rs         // DownloadRequest, DownloadId, FormatPreset, DownloadEvent
│   ├─ media.rs            // MediaInfo, FormatSummary, ThumbnailRef
│   ├─ setup.rs            // SetupEvent, SetupError, Diagnostics
│   └─ error.rs            // CommandError
├─ download/
│   ├─ mod.rs
│   ├─ binaries.rs         // tiered binary resolution (§2.1) + LibraryInstaller wrapper
│   ├─ service.rs          // DownloadService — validation, presets, orchestration
│   ├─ manager.rs          // DownloadManager — task registry, cancellation tokens
│   ├─ extractor/
│   │   ├─ mod.rs          // ExtractorBackend trait
│   │   ├─ crate_impl.rs   // YtDlpCrateExtractor (default — wraps boul2gom Downloader)
│   │   └─ cli.rs          // CliExtractor (feature = "extractor-cli", opt-in)
│   ├─ presets.rs          // app FormatPreset → crate FormatPreferences
│   ├─ progress.rs         // hook callbacks → DownloadEvent, coalescing
│   └─ error.rs            // DownloadError → contracts::CommandError
└─ util/
    ├─ url.rs              // URL validation + scheme allowlist
    └─ path.rs             // canonicalize + jail-to-output-dir
```

## 5. Cargo.toml (delta)

```toml
[dependencies]
tauri               = { version = "2", features = ["protocol-asset"] }
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs     = "2"
tauri-plugin-log    = "2"

# yt-dlp crate — with the features we actually need
yt-dlp = { version = "2.7", default-features = false, features = [
    "cache-memory",   # in-memory L1 cache (already default; explicit is clearer)
    "hooks",          # Rust callbacks for download events → we need these for progress
    "statistics",     # download counters surfaced in diagnostics UI
    "rustls",         # avoid OpenSSL system dependency on Linux/macOS builds
    "hickory-dns",    # async pure-Rust DNS — better latency, no blocking syscalls
] }

tokio               = { version = "1", features = ["macros", "rt-multi-thread", "sync", "time"] }
tokio-util          = { version = "0.7", features = ["rt"] }
async-trait         = "0.1"
thiserror           = "2"
serde               = { version = "1", features = ["derive"] }
serde_json          = "1"
url                 = "2"
dashmap             = "6"
tracing             = "0.1"
tracing-subscriber  = { version = "0.3", features = ["env-filter", "json"] }

[build-dependencies]
ts-rs = "10"   # generates src/lib/api-contracts.gen.ts on cargo build

[features]
default        = []
extractor-cli  = []   # opt-in: use a user-provided yt-dlp / ffmpeg via PATH instead of crate-managed install
cache-persist  = ["yt-dlp/cache-redb"]  # optional L2 cache (single-file ACID) — defer to v0.2

[lints.clippy]
unwrap_used      = "deny"
expect_used      = "warn"
unwrap_in_result = "deny"

[lints.rust]
unsafe_code = "forbid"
```

> **No `tauri-plugin-shell` needed for the extractor.** The crate launches yt-dlp / ffmpeg subprocesses itself; we don't go through Tauri's shell plugin. This collapses the Tauri capability surface significantly (Plan 06).

## 6. IPC contract

### 6.1 Types (mirrored to `src/lib/api-contracts.gen.ts` via `ts-rs`)

```rust
// src-tauri/src/contracts/download.rs
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/api-contracts.gen.ts")]
pub struct DownloadId(pub u64);

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/lib/api-contracts.gen.ts")]
pub enum FormatPreset {
    BestVideoAudio,   // → crate's Youtube::Best (or ModernCodecs if user opts in)
    BestAudio,        // → AudioOnly
    Mp4Compatible,    // → High with mp4 container constraint
    MetadataOnly,     // → fetch_video_infos only, skip download
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/api-contracts.gen.ts")]
pub struct DownloadRequest {
    pub url: String,
    pub output_dir: String,
    pub preset: FormatPreset,
    pub filename_template: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case", tag = "phase", content = "data")]
#[ts(export, export_to = "../../src/lib/api-contracts.gen.ts")]
pub enum DownloadEvent {
    Resolving   { id: DownloadId },
    Downloading {
        id: DownloadId,
        downloaded: u64,
        total: Option<u64>,
        speed_bps: Option<u64>,
        eta_s: Option<u64>,
        percent: Option<f32>,
        segments_done: Option<u32>,     // crate exposes this — surface it
        segments_total: Option<u32>,
    },
    Merging     { id: DownloadId },
    Postprocess { id: DownloadId, step: String },
    Complete    { id: DownloadId, output_path: String, bytes: u64 },
    Failed      { id: DownloadId, error: CommandError },
    Cancelled   { id: DownloadId },
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case", tag = "phase", content = "data")]
#[ts(export, export_to = "../../src/lib/api-contracts.gen.ts")]
pub enum SetupEvent {
    Idle,
    CheckingBinaries,
    DownloadingDependencies,
    InstallingYtDlp { progress: Option<f32> },
    InstallingFfmpeg { progress: Option<f32> },
    Ready { source: String, yt_dlp_version: String, ffmpeg_version: String },
    Failed { error: String },
}
```

### 6.2 Commands

| Command | Args | Returns | Streams |
|---|---|---|---|
| `setup_extractor` | `on_event: Channel<SetupEvent>` | `()` | yes — first-run binary download progress |
| `start_download` | `request: DownloadRequest, on_event: Channel<DownloadEvent>` | `DownloadId` | yes |
| `cancel_download` | `id: DownloadId` | `()` | — |
| `get_metadata` | `url: String` | `MediaInfo` | — (uses crate's `fetch_video_infos`; cache-hit returns instantly) |
| `list_active` | — | `Vec<ActiveDownload>` | — |
| `get_diagnostics` | — | `Diagnostics` (extractor source, versions, disk free, cache size) | — |
| `update_yt_dlp` | — | `String` (new version) | — (wraps `Downloader::update_downloader`) |
| `open_output_dir` | `path: String` | `()` | via `tauri-plugin-opener` |

### 6.3 `CommandError` enum

```rust
// src-tauri/src/contracts/error.rs
#[derive(Clone, Debug, thiserror::Error, Serialize, Deserialize, TS)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
#[ts(export, export_to = "../../src/lib/api-contracts.gen.ts")]
pub enum CommandError {
    #[error("extractor not ready — run setup")]
    ExtractorNotReady,
    #[error("dependency download failed: {0}")]
    DependencyDownloadFailed(String),
    #[error("site not supported")]
    UnsupportedSite,
    #[error("invalid url")]
    InvalidUrl,
    #[error("invalid output directory")]
    InvalidOutputDirectory,
    #[error("requested format unavailable")]
    FormatUnavailable,
    #[error("video unavailable")]
    VideoUnavailable,
    #[error("private or age-restricted video")]
    RestrictedVideo,
    #[error("network error: {0}")]
    Network(String),
    #[error("download failed: {0}")]
    DownloadFailed(String),
    #[error("cancelled")]
    Cancelled,
    #[error("internal: {0}")]
    Internal(String),
}
```

## 7. `ExtractorBackend` trait + crate implementation

```rust
// src-tauri/src/download/extractor/mod.rs
use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

#[async_trait]
pub trait ExtractorBackend: Send + Sync + 'static {
    async fn extract_info(&self, url: &str) -> Result<MediaInfo, DownloadError>;
    async fn download(
        &self,
        req: ResolvedDownloadRequest,
        progress: ProgressSink,
        cancel: CancellationToken,
    ) -> Result<DownloadResult, DownloadError>;
    async fn update(&self) -> Result<String, DownloadError>;
}
```

```rust
// src-tauri/src/download/extractor/crate_impl.rs
use yt_dlp::{Downloader, client::deps::Libraries};

pub struct YtDlpCrateExtractor {
    downloader: Arc<Downloader>,
}

impl YtDlpCrateExtractor {
    pub async fn new(libs: Libraries, output_dir: PathBuf) -> Result<Self, SetupError> {
        let downloader = Downloader::builder(libs, output_dir).build().await
            .map_err(SetupError::builder)?;
        Ok(Self { downloader: Arc::new(downloader) })
    }
}

#[async_trait]
impl ExtractorBackend for YtDlpCrateExtractor {
    async fn extract_info(&self, url: &str) -> Result<MediaInfo, DownloadError> {
        let info = self.downloader.fetch_video_infos(url).await
            .map_err(DownloadError::from_crate)?;
        Ok(MediaInfo::from(info))
    }

    async fn download(
        &self,
        req: ResolvedDownloadRequest,
        progress: ProgressSink,
        cancel: CancellationToken,
    ) -> Result<DownloadResult, DownloadError> {
        // Register a crate hook that converts crate events → our ProgressSink.
        let hook_token = self.downloader.hooks().on_progress({
            let sink = progress.clone();
            move |ev| { sink.try_send_progress(ev); }
        });

        let result = tokio::select! {
            _ = cancel.cancelled() => {
                // crate doesn't have a "cancel this download" API; we abort the future.
                // The next reqwest segment fetch will short-circuit.
                Err(DownloadError::Cancelled)
            }
            r = self.downloader.download_video(&req.video, &req.filename) => {
                r.map(DownloadResult::SingleFile).map_err(DownloadError::from_crate)
            }
        };

        self.downloader.hooks().remove(hook_token);
        result
    }

    async fn update(&self) -> Result<String, DownloadError> {
        self.downloader.update_downloader().await
            .map_err(DownloadError::from_crate)?;
        Ok(probe_yt_dlp_version().await?)
    }
}
```

> **Cancellation note:** the crate doesn't expose a per-download cancel handle in the current public API. We rely on `tokio::select!` dropping the future, which causes its in-flight reqwest segments to be dropped on the next `.await`. For finer control we keep an issue tracker entry to upstream a `cancel_download(id)` PR to the crate later. **Acceptable for v0.1** because the latency to actual stop is bounded by one segment fetch (~10 MB / typical bandwidth → << 1 s).

## 8. DownloadService & DownloadManager

```rust
// src-tauri/src/download/service.rs
pub struct DownloadService {
    extractor: Arc<dyn ExtractorBackend>,
    manager:   Arc<DownloadManager>,
    settings:  Arc<RwLock<Settings>>,
}

impl DownloadService {
    pub async fn start(&self, req: DownloadRequest, sink: ProgressSink) -> Result<DownloadId, CommandError> {
        let url = util::url::validate(&req.url)?;
        let out = util::path::canonicalize_within(&req.output_dir)?;
        let info = self.extractor.extract_info(url.as_str()).await?;
        let resolved = presets::resolve(&req.preset, &info, &out, req.filename_template.as_deref())?;

        let id = self.manager.new_id();
        let cancel = self.manager.token(id);

        let me = self.clone();
        tokio::spawn(async move {
            sink.emit(DownloadEvent::Resolving { id });
            let r = me.extractor.download(resolved, sink.clone(), cancel).await;
            match r {
                Err(DownloadError::Cancelled) => sink.emit(DownloadEvent::Cancelled { id }),
                Err(e) => sink.emit(DownloadEvent::Failed { id, error: e.into() }),
                Ok(DownloadResult::SingleFile(p)) => sink.emit(DownloadEvent::Complete {
                    id, output_path: p.to_string_lossy().into(),
                    bytes: fs::metadata(&p).map(|m| m.len()).unwrap_or(0),
                }),
            }
            me.manager.finish(id);
        });

        Ok(id)
    }
}
```

`DownloadManager`: `AtomicU64` id counter, `DashMap<DownloadId, CancellationToken>`, `DashMap<DownloadId, ActiveDownload>`, `drain_on_exit()` invoked from `RunEvent::ExitRequested`.

## 9. Progress event coalescing

The crate's `hooks::on_progress` may fire at high frequency (per HTTP segment). We coalesce:

1. Hook callback → `ProgressSink::try_send` into a per-download `mpsc` (capacity 64, drop-on-full).
2. Per-download "coalescer" task reads the channel, keeps the latest, and `Channel::send`s to the frontend on a `tokio::time::interval(Duration::from_millis(100))` tick.
3. Terminal events bypass the throttle.

Result: **≤ 10 events/s/download** at the IPC boundary regardless of raw rate. Satisfies GOAL.md NFR §4 and the doc's "Batch or throttle progress updates" rule.

## 10. Validation rules (security — unchanged)

| Field | Rule | Reject with |
|---|---|---|
| `url` | `url::Url::parse` succeeds; scheme ∈ {`http`, `https`}; host ≠ `localhost`/`127.0.0.1`/`::1` | `CommandError::InvalidUrl` |
| `output_dir` | exists, is a directory, writable, canonicalized; not under restricted system dirs | `CommandError::InvalidOutputDirectory` |
| `filename_template` | regex `^[A-Za-z0-9 _.\-\(\)\[\]\{\}%]+$` after stripping `%(...)s` tokens; max 200 chars | `CommandError::Internal("invalid template")` |
| `preset` | enum — serde rejects others | n/a |

All output writes go through `util::path::jail_within(out_dir, candidate)`.

## 11. React frontend layout (unchanged from prior plan, with one addition)

```
src/app/
├─ layout.tsx                       // shell only — Header, Sidebar; NEVER reads progress state
├─ page.tsx                         // redirects to /downloads (after setup)
├─ setup/page.tsx                   // NEW — first-run setup wizard (binary install progress)
└─ downloads/
    └─ page.tsx                     // 'use client' — DownloadForm + DownloadQueue

src/components/
├─ download-form.tsx
├─ download-queue.tsx               // owns Map<DownloadId, QueueItemState>
├─ download-queue-item.tsx          // memo()-ed; primitive props only
├─ progress-bar.tsx                 // GPU-only transform per Plan 07
├─ download-actions.tsx
└─ setup-progress.tsx               // NEW — listens to setup_extractor channel
```

The `src/src/app/setup/` route runs once on first launch (or after a corrupted-binary recovery). It calls `invoke<void>("setup_extractor", { onEvent: channel })`, shows progress, then `router.replace("/downloads")` on `SetupEvent::Ready`.

State strategy is unchanged from the previous draft: queue state stays in `DownloadQueue`, progress events update only the affected item, layout never re-renders for progress.

## 12. Plugins, capabilities, and CSP

`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "fs:allow-read-text-file",
    "opener:allow-open-path"
  ]
}
```

> **No `tauri-plugin-shell` and no `shell:allow-execute` entries.** The crate spawns subprocesses through standard `tokio::process` from inside Rust — that's allowed without a plugin. This is a significant attack-surface reduction vs. the original CLI-sidecar design.

`tauri.conf.json` `app.security.csp`:

```
default-src 'self' tauri:;
img-src 'self' tauri: asset: https: data:;
media-src 'self' tauri: asset: blob:;
connect-src 'self' ipc: tauri:;
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
```

Thumbnails over `https:` allowed. Everything else tight.

## 13. Cancellation & shutdown

- `cancel_download(id)` → `manager.token(id).cancel()`.
- Per-download tasks `select!` on `cancel.cancelled()` at the crate's `download_video` await.
- `RunEvent::ExitRequested` calls `manager.drain_on_exit(Duration::from_secs(2)).await`, which cancels everything, then waits up to 2 s, then forces `app.exit(0)`.

```rust
// src-tauri/src/lib.rs
.build(tauri::generate_context!())?
.run(|app, event| {
    if let RunEvent::ExitRequested { api, .. } = event {
        let manager = app.state::<Arc<DownloadManager>>();
        api.prevent_exit();
        tauri::async_runtime::block_on(manager.drain_on_exit(Duration::from_secs(2)));
        app.exit(0);
    }
});
```

## 14. Caching (use the crate's built-in cache)

Default: `cache-memory` (Moka L1, TTL-based, no persistence). Fits `get_metadata` perfectly — first call hits yt-dlp, subsequent calls within TTL are free.

CDN URL expiry is handled automatically by the crate: format URLs are tracked with `available_at` and silently invalidated after ~6 h.

For v0.2 we may enable `cache-persist` (feature = `cache-redb`) so metadata survives app restarts. ADR-006 will cover this when prioritized.

## 15. Testing

- **Unit tests** in `src-tauri/src/download/`: `url::validate`, `presets::resolve`, `manager::cancellation`, `progress::coalesce`.
- **Integration test** with a `MockExtractor` impl driving canned events through a fake `Channel`. Asserts ordering: `Resolving → Downloading × N → Complete`.
- **Wired test** (gated `#[ignore]` for CI by default) downloads a public-domain Wikimedia video via the real crate, asserts file exists, size matches.
- **FE tests** (Vitest): the `DownloadQueue` reducer given a recorded event sequence → expected `Map<DownloadId, QueueItemState>`.
- **E2E** (Playwright via tauri-driver, deferred to v0.2): submit URL → queue updates → cancel mid-download.

## 16. Performance expectations (documented in `docs/perf/baseline.md`)

From the crate's published benchmarks (see `docs/adr/ADR-005-yt-dlp-crate-pivot.md`):

| Scenario | Raw `yt-dlp` | Crate (Balanced) |
|---|---|---|
| Native 720p mp4 (no ffmpeg) | ~20.7 s | ~2.10 s |
| Muxed 720p (ffmpeg merge) | ~10.4 s | ~4.92 s |
| Muxed 1080p (ffmpeg merge) | ~18.3 s | ~10.5 s |
| Best quality muxed | ~18.2 s | ~13.7 s |

We will record actual measurements on CI Linux runners after Phase 1 and compare against these expectations. If real-world numbers don't approach these, we revisit (the perf was the entire reason for this pivot — ADR-005 §4).

## 17. Phase mapping (matches `YT_DLP_RUST_BACKEND.md` §Implementation plan)

| Phase | Deliverables |
|---|---|
| 1 Backend foundation | §4 layout, §5 deps, `binaries::resolve` (§2.1), `YtDlpCrateExtractor` (§7), `DownloadService` + `DownloadManager` (§8), `setup_extractor` + `start_download` + `cancel_download` + `get_metadata` commands, `CommandError` (§6.3) |
| 2 Frontend queue UI | §11 components, channel wiring, setup wizard, cancel button |
| 3 Performance pass | §9 coalescing measured, React Profiler before/after, memoize only if profile demands |
| 4 Packaging & release | Cross-platform `tauri build`, documented crate version, license file for yt-dlp + ffmpeg (Plan 08) |

## 18. Acceptance criteria

- [ ] React never imports from `../src-tauri/**` (ESLint enforced).
- [ ] Default build uses the `yt-dlp` crate; `extractor-cli` is OFF in shipped binaries.
- [ ] On first launch with no bin dir, `setup_extractor` downloads yt-dlp + ffmpeg and reports `Ready` within 60 s on a 50 Mbps connection.
- [ ] A download can be started, monitored, completed, failed, cancelled — covered by integration test.
- [ ] Progress updates re-render only `DownloadQueueItem` (React Profiler proof in `docs/perf/`).
- [ ] Output paths canonicalized and jailed — fuzz tests in `tests/path_traversal.rs`.
- [ ] 720p mp4 download from YouTube measured at ≤ 3 s on a 50 Mbps Linux CI runner (proves the crate's perf claim).
- [ ] CSP has zero `unsafe-eval`; capability JSON has zero `shell:allow-execute` entries.

## 19. Execution checklist

- [ ] **Y-1** Add deps from §5 to `src-tauri/Cargo.toml` (`yt-dlp` with the listed features).
- [ ] **Y-2** Create module skeleton from §4 with `todo!()` stubs.
- [ ] **Y-3** Implement `contracts/` (download, error, setup, media) and wire `ts-rs` `build.rs` step that generates `src/lib/api-contracts.gen.ts` on `cargo build`.
- [ ] **Y-4** Implement `util::url::validate` + `util::path::canonicalize_within` with unit tests covering: scheme rejection, localhost rejection, traversal `..`, symlink escape.
- [ ] **Y-5** Implement `binaries::resolve` (§2.1) with tiered fallback and `SetupEvent` emission.
- [ ] **Y-6** Implement `ExtractorBackend` trait + `YtDlpCrateExtractor` happy path (§7).
- [ ] **Y-7** Implement `DownloadManager` (id, cancel, registry, drain).
- [ ] **Y-8** Implement `DownloadService::start` + spawned task with `tokio::select!` cancellation.
- [ ] **Y-9** Implement `ProgressSink` + 100 ms coalescer.
- [ ] **Y-10** Wire commands in `lib.rs` + `manage(Arc<...>)` state.
- [ ] **Y-11** Add `MockExtractor` and integration test asserting event ordering.
- [ ] **Y-12** Frontend: `src/src/app/setup/page.tsx` + `setup-progress.tsx` listening to `setup_extractor`.
- [ ] **Y-13** Frontend: `download-queue.tsx` reducer; `download-queue-item.tsx` memoized; primitive props only.
- [ ] **Y-14** Frontend: `src/lib/api-client.ts` calling `invoke<DownloadId>("start_download", { request, onEvent: channel })`.
- [ ] **Y-15** Add `src/src/app/downloads/page.tsx` with form + queue.
- [ ] **Y-16** Add `RunEvent::ExitRequested` cleanup.
- [ ] **Y-17** Add Vitest test for reducer; Rust tests passing.
- [ ] **Y-18** Implement `update_yt_dlp` command + weekly background-task scheduler.
- [ ] **Y-19** Update `documentation/CHANGELOG.md` with the architectural pivot (see ADR-005).
- [ ] **Y-20** Measure 720p YouTube download speed on CI; record in `docs/perf/baseline.md`.
