# Skill: yt-dlp crate recipe

See `.gemini/antigravity/knowledge/05_yt_dlp_crate_api.md` for the full surface.

Quick recipes:

## Resolve binaries with progress

```rust
use yt_dlp::client::deps::{Libraries, LibraryInstaller};

async fn resolve(app_data: &Path, sink: &SetupSink) -> Result<Libraries, SetupError> {
    let bin = app_data.join("bin");
    let ytd = bin.join(yt_dlp_exe_name());
    let ffm = bin.join(ffmpeg_exe_name());
    if !ytd.exists() || !ffm.exists() {
        sink.emit(SetupEvent::DownloadingDependencies);
        let inst = LibraryInstaller::new(bin.clone());
        sink.emit(SetupEvent::InstallingYtDlp { progress: None });
        inst.install_youtube(None).await.map_err(SetupError::install)?;
        sink.emit(SetupEvent::InstallingFfmpeg { progress: None });
        inst.install_ffmpeg(None).await.map_err(SetupError::install)?;
    }
    Ok(Libraries::new(ytd, ffm))
}
```

## Download with cancellation

```rust
let result = tokio::select! {
    _ = cancel.cancelled() => Err(DownloadError::Cancelled),
    r = downloader.download_video(&info, &filename) => r.map_err(DownloadError::from_crate),
};
```

## Self-update

```rust
downloader.update_downloader().await?;
```

Never:
- Construct yt-dlp CLI argument strings yourself. Use the crate's typed API.
- Bundle `yt-dlp` or `ffmpeg` via Tauri `externalBin`. The crate manages binaries.
- Add `tauri-plugin-shell` to the project for this feature.
