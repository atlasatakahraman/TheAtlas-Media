# Glossary

- **DownloadId** — `pub struct DownloadId(pub u64)`. Backend-generated correlation key.
- **FormatPreset** — `BestVideoAudio | BestAudio | Mp4Compatible | MetadataOnly`. UI-facing enum that maps to crate format selection.
- **ExtractorBackend** — async trait wrapping the boul2gom `yt-dlp` crate. Default impl `YtDlpCrateExtractor`. Opt-in `CliExtractor` behind feature `extractor-cli`.
- **DownloadService** — validates requests, resolves presets, spawns the per-download task. Holds `Arc<dyn ExtractorBackend>`.
- **DownloadManager** — task registry. Owns `DashMap<DownloadId, CancellationToken>` and `drain_on_exit()`.
- **ProgressSink** — wrapped `mpsc::Sender<RawProgress>` + 100 ms coalescer task that forwards to a Tauri `Channel<DownloadEvent>`.
- **CommandError** — `thiserror` enum returned from every `#[tauri::command]`. Variants: `ExtractorNotReady`, `DependencyDownloadFailed`, `UnsupportedSite`, `InvalidUrl`, `InvalidOutputDirectory`, `FormatUnavailable`, `VideoUnavailable`, `RestrictedVideo`, `Network`, `DownloadFailed`, `Cancelled`, `Internal`.
- **DownloadEvent** — `Resolving | Downloading | Merging | Postprocess | Complete | Failed | Cancelled`. Streamed via `ipc::Channel<DownloadEvent>`.
- **SetupEvent** — `Idle | CheckingBinaries | DownloadingDependencies | InstallingYtDlp | InstallingFfmpeg | Ready | Failed`.
- **AAKNCL** — Atlas Ata Kahraman Non-Commercial License v1.0.
- **D1–D11** — see `01_locked_decisions.md`.
- **src/ layout** — All application code lives under src/. Plans use src/app, src/components, src/lib paths. Imports use the @/* alias mapped to ./src/* in tsconfig.json.
