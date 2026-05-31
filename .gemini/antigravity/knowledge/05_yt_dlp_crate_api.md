# boul2gom `yt-dlp` crate — API surface we actually use

Crate: `yt-dlp = "2.7"` with `default-features = false` and features `cache-memory`, `hooks`, `statistics`, `rustls`, `hickory-dns`.

## Binary management

```rust
use yt_dlp::client::deps::{Libraries, LibraryInstaller};

let installer = LibraryInstaller::new(bin_dir.clone());
installer.install_youtube(None).await?;   // downloads yt-dlp
installer.install_ffmpeg(None).await?;    // downloads static ffmpeg (LGPL)
let libs = Libraries::new(bin_dir.join("yt-dlp"), bin_dir.join("ffmpeg"));
```

One-shot convenience (we don't use because we need progress UI):
```rust
let downloader = yt_dlp::Downloader::with_new_binaries(executables_dir, output_dir).await?
    .build().await?;
```

## Building the downloader

```rust
let downloader = yt_dlp::Downloader::builder(libs, output_dir).build().await?;
```

## Metadata + download

```rust
let info  = downloader.fetch_video_infos(url).await?;
let path  = downloader.download_video(&info, "out.mp4").await?;
// audio-only:
let audio = downloader.download_audio_stream(&info, "out.mp3").await?;
```

## Progress hooks

```rust
let token = downloader.hooks().on_progress(|event| {
    // event has: downloaded_bytes, total_bytes, speed, eta, fragment_index, fragment_count
});
// later:
downloader.hooks().remove(token);
```

## Self-update

```rust
downloader.update_downloader().await?;    // refreshes yt-dlp + ffmpeg binaries
```

## Things we do NOT do

- We do not pass raw `yt-dlp` CLI flags through the crate. We map app-defined `FormatPreset` to the crate's `extractor::Youtube` presets (`Best`, `Premium`, `High`, `Medium`, `Low`, `AudioOnly`, `ModernCodecs`).
- We do not spawn `yt-dlp` or `ffmpeg` ourselves via `tauri-plugin-shell` — the crate spawns subprocesses internally.
- We do not bundle `yt-dlp` or `ffmpeg` via Tauri `externalBin`. The crate installs them at runtime.

Cancellation: the crate has no per-download cancel handle. We cancel by dropping the future via `tokio::select! { _ = cancel.cancelled() => ..., r = downloader.download_video(...) => ... }`. Latency to actual stop ≤ one segment fetch (~< 1 s).
