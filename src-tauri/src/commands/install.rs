use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

use super::dependency::{
    self, check_tool, invalidate_candidate_cache, managed_bin_dir, read_version, DependencyStatus,
    Tool,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub name: String,
    pub status: InstallProgressStatus,
    pub progress: f64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallProgressStatus {
    CheckingManifest,
    Downloading,
    Extracting,
    Verifying,
    Installed,
    Failed,
}

#[derive(Debug, thiserror::Error)]
pub enum InstallError {
    #[error("unsupported platform")]
    UnsupportedPlatform,
    #[error("unknown dependency: {0}")]
    UnknownDependency(String),
    #[error("download failed: {0}")]
    DownloadFailed(String),
    #[error("extraction failed: {0}")]
    ExtractionFailed(String),
    #[error("verification failed: {0}")]
    VerificationFailed(String),
    #[error("filesystem error: {0}")]
    FsError(String),
}

/// Serialize as a plain string for IPC error responses.
impl Serialize for InstallError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Target download and extraction scope.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum DownloadTarget {
    FFmpeg,
    FFprobe,
    FfmpegBundle,
    YtDlp,
}

impl DownloadTarget {
    /// Human-readable names for progress events.
    fn event_names(self) -> &'static [&'static str] {
        match self {
            DownloadTarget::FFmpeg => &["ffmpeg"],
            DownloadTarget::FFprobe => &["ffprobe"],
            DownloadTarget::FfmpegBundle => &["ffmpeg", "ffprobe"],
            DownloadTarget::YtDlp => &["yt-dlp"],
        }
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Install a single dependency by name. Returns immediately and streams
/// progress via `install-progress` events.
#[tauri::command]
pub async fn install_dependency(app: AppHandle, name: String) -> Result<(), InstallError> {
    let target = name_to_target(&name)?;

    let app_clone = app.clone();
    tokio::spawn(async move {
        if let Err(e) = do_install(&app_clone, target).await {
            emit_to_names(
                &app_clone,
                target.event_names(),
                InstallProgressStatus::Failed,
                0.0,
                &e.to_string(),
            );
        }
    });

    Ok(())
}

/// Install or update specific tool names.
/// If both "ffmpeg" and "ffprobe" are in names, bundles them into FfmpegBundle
/// so the archive is only downloaded once and both are extracted.
#[tauri::command]
pub async fn install_tools(app: AppHandle, names: Vec<String>) -> Result<(), InstallError> {
    let mut targets = std::collections::HashSet::new();

    let has_ffmpeg = names.iter().any(|n| n == "ffmpeg");
    let has_ffprobe = names.iter().any(|n| n == "ffprobe");
    let has_ytdlp = names.iter().any(|n| n == "yt-dlp" || n == "ytdlp");

    if has_ffmpeg && has_ffprobe {
        targets.insert(DownloadTarget::FfmpegBundle);
    } else if has_ffmpeg {
        targets.insert(DownloadTarget::FFmpeg);
    } else if has_ffprobe {
        targets.insert(DownloadTarget::FFprobe);
    }

    if has_ytdlp {
        targets.insert(DownloadTarget::YtDlp);
    }

    for target in targets {
        let app_clone = app.clone();
        tokio::spawn(async move {
            if let Err(e) = do_install(&app_clone, target).await {
                emit_to_names(
                    &app_clone,
                    target.event_names(),
                    InstallProgressStatus::Failed,
                    0.0,
                    &e.to_string(),
                );
            }
        });
    }

    Ok(())
}

/// Install all missing dependencies concurrently.
#[tauri::command]
pub async fn install_all_missing(app: AppHandle) -> Result<(), InstallError> {
    let report = dependency::check_dependencies(app.clone())
        .await
        .map_err(InstallError::DownloadFailed)?;

    let mut names = Vec::new();
    if matches!(report.ffmpeg.status, DependencyStatus::NotInstalled) {
        names.push("ffmpeg".to_string());
    }
    if matches!(report.ffprobe.status, DependencyStatus::NotInstalled) {
        names.push("ffprobe".to_string());
    }
    if matches!(report.ytdlp.status, DependencyStatus::NotInstalled) {
        names.push("yt-dlp".to_string());
    }

    install_tools(app, names).await
}

/// Uninstall a managed dependency by removing its binary files from managed_bin_dir.
#[tauri::command]
pub async fn uninstall_dependency(app: AppHandle, name: String) -> Result<(), InstallError> {
    let bin_dir = managed_bin_dir(&app).map_err(InstallError::FsError)?;
    let target = name_to_target(&name)?;

    let tools_to_remove: Vec<Tool> = match target {
        DownloadTarget::FFmpeg => vec![Tool::FFmpeg],
        DownloadTarget::FFprobe => vec![Tool::FFprobe],
        DownloadTarget::FfmpegBundle => vec![Tool::FFmpeg, Tool::FFprobe],
        DownloadTarget::YtDlp => vec![Tool::YTdlp],
    };

    for tool in tools_to_remove {
        let exe_path = bin_dir.join(tool.exe_name());
        if exe_path.exists() {
            tokio::fs::remove_file(&exe_path)
                .await
                .map_err(|e| InstallError::FsError(e.to_string()))?;
        }
    }

    // The managed copy is gone — any cached "Change Path" candidate list
    // still listing it is now wrong.
    invalidate_candidate_cache();

    Ok(())
}

// ---------------------------------------------------------------------------
// Core install logic
// ---------------------------------------------------------------------------

pub(crate) async fn do_install(
    app: &AppHandle,
    target: DownloadTarget,
) -> Result<(), InstallError> {
    let bin_dir = managed_bin_dir(app).map_err(InstallError::FsError)?;
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| InstallError::FsError(e.to_string()))?;

    let result = match target {
        DownloadTarget::FFmpeg | DownloadTarget::FFprobe | DownloadTarget::FfmpegBundle => {
            install_ffmpeg(app, &bin_dir, target).await
        }
        DownloadTarget::YtDlp => install_ytdlp(app, &bin_dir).await,
    };

    // A fresh binary (or a new version of one) may have landed in the managed
    // dir, so the cached candidate probe results no longer describe what's on
    // disk. Invalidated even on failure — a partial install still writes files.
    invalidate_candidate_cache();

    result
}

async fn install_ffmpeg(
    app: &AppHandle,
    bin_dir: &Path,
    target: DownloadTarget,
) -> Result<(), InstallError> {
    let url = ffmpeg_download_url()?;
    let names = target.event_names();
    let client = make_http_client()?;

    let (tools_to_install, files_to_extract): (Vec<Tool>, Vec<&'static str>) = match target {
        DownloadTarget::FFmpeg => (vec![Tool::FFmpeg], vec![Tool::FFmpeg.exe_name()]),
        DownloadTarget::FFprobe => (vec![Tool::FFprobe], vec![Tool::FFprobe.exe_name()]),
        DownloadTarget::FfmpegBundle => (
            vec![Tool::FFmpeg, Tool::FFprobe],
            vec![Tool::FFmpeg.exe_name(), Tool::FFprobe.exe_name()],
        ),
        _ => {
            return Err(InstallError::UnknownDependency(
                "Invalid target for FFmpeg download".into(),
            ))
        }
    };

    // ── Step 1: Fetch SHA-256 manifest ──────────────────────────────────────
    emit_to_names(
        app,
        names,
        InstallProgressStatus::CheckingManifest,
        0.0,
        "Fetching FFmpeg release manifest…",
    );
    let expected_sha256 = fetch_ffmpeg_expected_sha256(&client).await?;

    // ── Step 2: Download archive ─────────────────────────────────────────────
    let archive_ext = archive_extension();
    let archive_path = bin_dir.join(format!("ffmpeg-download.{archive_ext}"));
    download_file(app, &client, url, &archive_path, names).await?;

    // ── Step 3: Verify SHA-256 of downloaded archive ─────────────────────────
    emit_to_names(
        app,
        names,
        InstallProgressStatus::Verifying,
        0.0,
        "Verifying SHA-256 checksum…",
    );
    verify_download_sha256(&archive_path, &expected_sha256).await?;

    // ── Step 4: Extract binaries ─────────────────────────────────────────────
    emit_to_names(
        app,
        names,
        InstallProgressStatus::Extracting,
        0.0,
        "Extracting binaries…",
    );

    extract_archive(&archive_path, bin_dir, &files_to_extract).await?;
    let _ = tokio::fs::remove_file(&archive_path).await;

    #[cfg(unix)]
    for tool in &tools_to_install {
        set_executable(&bin_dir.join(tool.exe_name()))?;
    }

    // ── Step 5: Verify binaries run correctly ────────────────────────────────
    emit_to_names(
        app,
        names,
        InstallProgressStatus::Verifying,
        0.0,
        "Verifying installed binaries…",
    );

    for tool in &tools_to_install {
        verify_tool(app, *tool, bin_dir).await?;
    }

    emit_to_names(
        app,
        names,
        InstallProgressStatus::Installed,
        100.0,
        "Installed successfully",
    );

    Ok(())
}

async fn install_ytdlp(app: &AppHandle, bin_dir: &Path) -> Result<(), InstallError> {
    let url = ytdlp_download_url()?;
    let names = DownloadTarget::YtDlp.event_names();
    let dest = bin_dir.join(Tool::YTdlp.exe_name());
    let client = make_http_client()?;

    // ── Step 1: Fetch SHA-256 manifest ──────────────────────────────────────
    emit_to_names(
        app,
        names,
        InstallProgressStatus::CheckingManifest,
        0.0,
        "Fetching yt-dlp release manifest…",
    );
    let expected_sha256 = fetch_ytdlp_expected_sha256(&client).await?;

    // ── Step 2: Download binary ──────────────────────────────────────────────
    download_file(app, &client, url, &dest, names).await?;

    // ── Step 3: Verify SHA-256 ───────────────────────────────────────────────
    emit_to_names(
        app,
        names,
        InstallProgressStatus::Verifying,
        0.0,
        "Verifying SHA-256 checksum…",
    );
    verify_download_sha256(&dest, &expected_sha256).await?;

    // ── Step 4: Set executable bit ───────────────────────────────────────────
    #[cfg(unix)]
    set_executable(&dest)?;

    // ── Step 5: Verify binary runs correctly ─────────────────────────────────
    emit_to_names(
        app,
        names,
        InstallProgressStatus::Verifying,
        0.0,
        "Verifying installed binary…",
    );
    verify_tool(app, Tool::YTdlp, bin_dir).await?;

    emit_to_names(
        app,
        names,
        InstallProgressStatus::Installed,
        100.0,
        "Installed successfully",
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// Download with progress
// ---------------------------------------------------------------------------

async fn download_file(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    event_names: &[&str],
) -> Result<(), InstallError> {
    emit_to_names(
        app,
        event_names,
        InstallProgressStatus::Downloading,
        0.0,
        "Starting download…",
    );

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))?;

    if !response.status().is_success() {
        return Err(InstallError::DownloadFailed(format!(
            "HTTP {}",
            response.status()
        )));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| InstallError::FsError(e.to_string()))?;

    // Throttle: emit at most once per 250 ms OR when progress jumps ≥ 1 %.
    let mut last_emitted_pct: f64 = -1.0;
    let mut last_emit_at = std::time::Instant::now();
    let mut bytes_at_last_emit: u64 = 0;
    let throttle = std::time::Duration::from_millis(250);

    let mut response = response;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| InstallError::FsError(e.to_string()))?;

        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            let pct_floor = (progress * 10.0).floor() / 10.0;
            let elapsed = last_emit_at.elapsed();

            if elapsed >= throttle || (pct_floor - last_emitted_pct).abs() >= 1.0 {
                // Instantaneous speed over the last emit interval
                let elapsed_secs = elapsed.as_secs_f64().max(0.001);
                let bytes_since = downloaded.saturating_sub(bytes_at_last_emit);
                let speed_bps = bytes_since as f64 / elapsed_secs;
                let speed_str = if speed_bps >= 1_048_576.0 {
                    format!("{:.1} MB/s", speed_bps / 1_048_576.0)
                } else if speed_bps >= 1024.0 {
                    format!("{:.0} KB/s", speed_bps / 1024.0)
                } else {
                    "< 1 KB/s".to_string()
                };

                let msg = format!(
                    "{:.1} / {:.1} MB  •  {}",
                    downloaded as f64 / 1_048_576.0,
                    total_size as f64 / 1_048_576.0,
                    speed_str,
                );
                emit_to_names(
                    app,
                    event_names,
                    InstallProgressStatus::Downloading,
                    progress,
                    &msg,
                );
                last_emitted_pct = pct_floor;
                bytes_at_last_emit = downloaded;
                last_emit_at = std::time::Instant::now();
            }
        }
    }

    file.flush()
        .await
        .map_err(|e| InstallError::FsError(e.to_string()))?;

    // Final 100 % event.
    if total_size > 0 {
        let msg = format!(
            "{:.1} / {:.1} MB",
            downloaded as f64 / 1_048_576.0,
            total_size as f64 / 1_048_576.0
        );
        emit_to_names(
            app,
            event_names,
            InstallProgressStatus::Downloading,
            100.0,
            &msg,
        );
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Archive extraction — offloaded to blocking threads for CPU performance
// ---------------------------------------------------------------------------

async fn extract_archive(
    archive_path: &Path,
    dest_dir: &Path,
    files_to_extract: &[&str],
) -> Result<(), InstallError> {
    let archive = archive_path.to_path_buf();
    let dest = dest_dir.to_path_buf();
    let wanted: Vec<String> = files_to_extract.iter().map(|s| s.to_string()).collect();

    // CPU-bound decompression runs on the blocking thread pool
    // per obsidian doc 03-Rust-Concurrency-Async: "Never block a tokio thread".
    tokio::task::spawn_blocking(move || extract_archive_sync(&archive, &dest, &wanted))
        .await
        .map_err(|e| InstallError::ExtractionFailed(e.to_string()))?
}

fn extract_archive_sync(
    archive_path: &Path,
    dest_dir: &Path,
    wanted_files: &[String],
) -> Result<(), InstallError> {
    let ext = archive_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match ext {
        "xz" => extract_tar_xz(archive_path, dest_dir, wanted_files),
        "zip" => extract_zip(archive_path, dest_dir, wanted_files),
        other => Err(InstallError::ExtractionFailed(format!(
            "unsupported archive format: {other}"
        ))),
    }
}

fn extract_tar_xz(
    archive_path: &Path,
    dest_dir: &Path,
    wanted_files: &[String],
) -> Result<(), InstallError> {
    let file = std::fs::File::open(archive_path)
        .map_err(|e| InstallError::ExtractionFailed(e.to_string()))?;
    let decompressor = xz2::read::XzDecoder::new(file);
    let mut archive = tar::Archive::new(decompressor);

    for entry in archive
        .entries()
        .map_err(|e| InstallError::ExtractionFailed(e.to_string()))?
    {
        let mut entry = entry.map_err(|e| InstallError::ExtractionFailed(e.to_string()))?;
        let path = entry
            .path()
            .map_err(|e| InstallError::ExtractionFailed(e.to_string()))?;

        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        if wanted_files.iter().any(|w| w == file_name) {
            let dest_path = dest_dir.join(file_name);
            entry
                .unpack(&dest_path)
                .map_err(|e| InstallError::ExtractionFailed(e.to_string()))?;
        }
    }

    Ok(())
}

fn extract_zip(
    archive_path: &Path,
    dest_dir: &Path,
    wanted_files: &[String],
) -> Result<(), InstallError> {
    let file = std::fs::File::open(archive_path)
        .map_err(|e| InstallError::ExtractionFailed(e.to_string()))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| InstallError::ExtractionFailed(e.to_string()))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| InstallError::ExtractionFailed(e.to_string()))?;

        let file_name = Path::new(entry.name())
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if wanted_files.iter().any(|w| w == &file_name) {
            let dest_path = dest_dir.join(&file_name);
            let mut outfile = std::fs::File::create(&dest_path)
                .map_err(|e| InstallError::ExtractionFailed(e.to_string()))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| InstallError::ExtractionFailed(e.to_string()))?;
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

async fn verify_tool(app: &AppHandle, tool: Tool, bin_dir: &Path) -> Result<(), InstallError> {
    let exe_path = bin_dir.join(tool.exe_name());

    read_version(&exe_path, tool)
        .await
        .map_err(|e| InstallError::VerificationFailed(format!("{}: {e}", tool.name())))?;

    // Double-check via the full resolution pipeline.
    let info = check_tool(app, tool).await;
    if matches!(info.status, DependencyStatus::NotInstalled) {
        return Err(InstallError::VerificationFailed(format!(
            "{} installed but verification failed: {}",
            tool.name(),
            info.error.unwrap_or_default()
        )));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Platform-aware download URLs (Linux + Windows only; macOS deferred)
// ---------------------------------------------------------------------------

fn ffmpeg_download_url() -> Result<&'static str, InstallError> {
    if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Ok("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz")
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        Ok("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz")
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Ok("https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip")
    } else {
        Err(InstallError::UnsupportedPlatform)
    }
}

fn ytdlp_download_url() -> Result<&'static str, InstallError> {
    if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux")
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64")
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Ok("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe")
    } else {
        Err(InstallError::UnsupportedPlatform)
    }
}

fn archive_extension() -> &'static str {
    if cfg!(target_os = "windows") {
        "zip"
    } else {
        "tar.xz"
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

pub(crate) fn name_to_target(name: &str) -> Result<DownloadTarget, InstallError> {
    match name {
        "ffmpeg" => Ok(DownloadTarget::FFmpeg),
        "ffprobe" => Ok(DownloadTarget::FFprobe),
        "ffmpeg_bundle" | "ffmpeg-bundle" => Ok(DownloadTarget::FfmpegBundle),
        "yt-dlp" | "ytdlp" => Ok(DownloadTarget::YtDlp),
        other => Err(InstallError::UnknownDependency(other.to_string())),
    }
}

fn emit_to_names(
    app: &AppHandle,
    names: &[&str],
    status: InstallProgressStatus,
    progress: f64,
    message: &str,
) {
    for name in names {
        let _ = app.emit(
            "install-progress",
            InstallProgress {
                name: name.to_string(),
                status: status.clone(),
                progress,
                message: message.to_string(),
            },
        );
    }
}

// ---------------------------------------------------------------------------
// Manifest & SHA-256 verification
// ---------------------------------------------------------------------------

fn ytdlp_binary_filename() -> &'static str {
    if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "yt-dlp_linux"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "yt-dlp_linux_aarch64"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "yt-dlp.exe"
    } else {
        "yt-dlp_linux"
    }
}

fn ffmpeg_archive_filename() -> &'static str {
    if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "ffmpeg-master-latest-linux64-gpl.tar.xz"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "ffmpeg-master-latest-linuxarm64-gpl.tar.xz"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "ffmpeg-master-latest-win64-gpl.zip"
    } else {
        "ffmpeg-master-latest-linux64-gpl.tar.xz"
    }
}

async fn fetch_ytdlp_expected_sha256(client: &reqwest::Client) -> Result<String, InstallError> {
    const SUMS_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";
    let filename = ytdlp_binary_filename();

    let text = client
        .get(SUMS_URL)
        .send()
        .await
        .map_err(|e| {
            InstallError::VerificationFailed(format!("Cannot fetch yt-dlp SHA2-256SUMS: {e}"))
        })?
        .text()
        .await
        .map_err(|e| {
            InstallError::VerificationFailed(format!("Cannot read yt-dlp SHA2-256SUMS: {e}"))
        })?;

    for line in text.lines() {
        // Format: "<hash>  <filename>"
        if let Some((hash, name)) = line.split_once("  ") {
            if name.trim() == filename {
                let hash = hash.trim().to_lowercase();
                if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Ok(hash);
                }
            }
        }
    }

    Err(InstallError::VerificationFailed(format!(
        "No SHA-256 entry for '{}' in yt-dlp SHA2-256SUMS manifest",
        filename
    )))
}

async fn fetch_ffmpeg_expected_sha256(client: &reqwest::Client) -> Result<String, InstallError> {
    const CHECKSUMS_URL: &str =
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256";
    let filename = ffmpeg_archive_filename();

    let text = client
        .get(CHECKSUMS_URL)
        .send()
        .await
        .map_err(|e| {
            InstallError::VerificationFailed(format!(
                "Cannot fetch FFmpeg checksums.sha256 manifest: {e}"
            ))
        })?
        .text()
        .await
        .map_err(|e| {
            InstallError::VerificationFailed(format!(
                "Cannot read FFmpeg checksums.sha256 manifest: {e}"
            ))
        })?;

    for line in text.lines() {
        // Format: "<hash>  <filename>"
        if let Some((hash, name)) = line.split_once(' ') {
            if name.trim() == filename {
                let hash = hash.trim().to_lowercase();
                if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Ok(hash);
                }
            }
        }
    }

    Err(InstallError::VerificationFailed(format!(
        "No SHA-256 entry for '{filename}' in FFmpeg checksums.sha256 manifest"
    )))
}

async fn verify_download_sha256(dest: &Path, expected: &str) -> Result<(), InstallError> {
    let computed = super::dependency::compute_file_sha256(dest)
        .await
        .map_err(|e| {
            InstallError::VerificationFailed(format!("SHA-256 computation failed: {e}"))
        })?;

    if computed.to_lowercase() != expected.to_lowercase() {
        // Remove tampered/corrupted file immediately
        let _ = tokio::fs::remove_file(dest).await;
        return Err(InstallError::VerificationFailed(format!(
            "SHA-256 mismatch — download may be corrupted or tampered.\nExpected: {expected}\nGot:      {computed}"
        )));
    }

    log::info!("SHA-256 verified OK: {computed}");
    Ok(())
}

fn make_http_client() -> Result<reqwest::Client, InstallError> {
    reqwest::Client::builder()
        .user_agent("TheAtlas-Media/0.0.1")
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), InstallError> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o755);
    std::fs::set_permissions(path, perms).map_err(|e| InstallError::FsError(e.to_string()))
}

// ---------------------------------------------------------------------------
// Dynamic Size Fetching (HTTP HEAD on Tokio)
// ---------------------------------------------------------------------------

pub(crate) fn download_url_for_name(name: &str) -> Result<&'static str, InstallError> {
    match name {
        "ffmpeg" | "ffprobe" => ffmpeg_download_url(),
        "yt-dlp" | "ytdlp" => ytdlp_download_url(),
        other => Err(InstallError::UnknownDependency(other.to_string())),
    }
}

/// Dynamically fetch Content-Length header via HTTP HEAD request on tokio.
/// Returns download size in Megabytes (MB).
#[tauri::command]
pub async fn get_download_size_mb(name: String) -> Result<f64, InstallError> {
    let url = download_url_for_name(&name)?;

    let client = reqwest::Client::builder()
        .user_agent("TheAtlas-Media/0.0.1")
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))?;

    let resp = client
        .get(url)
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
        .await
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))?;

    let total_bytes = if let Some(range) = resp.headers().get(reqwest::header::CONTENT_RANGE) {
        if let Ok(s) = range.to_str() {
            s.rsplit('/')
                .next()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0)
        } else {
            0
        }
    } else {
        resp.content_length().unwrap_or(0)
    };

    let mb = total_bytes as f64 / 1_048_576.0;

    Ok(mb)
}

/// Concurrently fetch download sizes for multiple dependency names on tokio threads.
#[tauri::command]
pub async fn get_all_download_sizes_mb(
    names: Vec<String>,
) -> Result<std::collections::HashMap<String, f64>, InstallError> {
    let mut join_set = tokio::task::JoinSet::new();

    for name in names {
        join_set.spawn(async move {
            let size = get_download_size_mb(name.clone()).await.unwrap_or(0.0);
            (name, size)
        });
    }

    let mut results = std::collections::HashMap::new();
    while let Some(res) = join_set.join_next().await {
        if let Ok((name, size)) = res {
            results.insert(name, size);
        }
    }

    Ok(results)
}
