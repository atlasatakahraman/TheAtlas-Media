use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

use super::dependency::{self, check_tool, managed_bin_dir, read_version, DependencyStatus, Tool};

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

/// FFmpeg and FFprobe are bundled in the same archive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum DownloadTarget {
    FfmpegBundle,
    YtDlp,
}

impl DownloadTarget {
    /// Human-readable names for progress events.
    fn event_names(self) -> &'static [&'static str] {
        match self {
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

/// Install all missing dependencies concurrently.
#[tauri::command]
pub async fn install_all_missing(app: AppHandle) -> Result<(), InstallError> {
    let report = dependency::check_dependencies(app.clone())
        .await
        .map_err(InstallError::DownloadFailed)?;

    let mut targets = std::collections::HashSet::new();

    if matches!(report.ffmpeg.status, DependencyStatus::NotInstalled)
        || matches!(report.ffprobe.status, DependencyStatus::NotInstalled)
    {
        targets.insert(DownloadTarget::FfmpegBundle);
    }
    if matches!(report.ytdlp.status, DependencyStatus::NotInstalled) {
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

/// Uninstall a managed dependency by removing its binary files from managed_bin_dir.
#[tauri::command]
pub async fn uninstall_dependency(app: AppHandle, name: String) -> Result<(), InstallError> {
    let bin_dir = managed_bin_dir(&app).map_err(InstallError::FsError)?;
    let target = name_to_target(&name)?;

    let tools_to_remove: Vec<Tool> = match target {
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

    match target {
        DownloadTarget::FfmpegBundle => install_ffmpeg_bundle(app, &bin_dir).await,
        DownloadTarget::YtDlp => install_ytdlp(app, &bin_dir).await,
    }
}

async fn install_ffmpeg_bundle(app: &AppHandle, bin_dir: &Path) -> Result<(), InstallError> {
    let url = ffmpeg_download_url()?;
    let names = DownloadTarget::FfmpegBundle.event_names();

    // Download archive to a temp file inside our managed directory.
    let archive_ext = archive_extension();
    let archive_path = bin_dir.join(format!("ffmpeg-download.{archive_ext}"));

    download_file(app, url, &archive_path, names).await?;

    // Extract ffmpeg + ffprobe binaries.
    emit_to_names(
        app,
        names,
        InstallProgressStatus::Extracting,
        0.0,
        "Extracting binaries…",
    );

    let ffmpeg_exe = Tool::FFmpeg.exe_name();
    let ffprobe_exe = Tool::FFprobe.exe_name();
    let files_to_extract = [ffmpeg_exe, ffprobe_exe];

    extract_archive(&archive_path, bin_dir, &files_to_extract).await?;

    // Clean up the archive.
    let _ = tokio::fs::remove_file(&archive_path).await;

    // Set executable on unix.
    #[cfg(unix)]
    {
        set_executable(&bin_dir.join(ffmpeg_exe))?;
        set_executable(&bin_dir.join(ffprobe_exe))?;
    }

    // Verify both binaries.
    emit_to_names(
        app,
        names,
        InstallProgressStatus::Verifying,
        0.0,
        "Verifying binaries…",
    );

    verify_tool(app, Tool::FFmpeg, bin_dir).await?;
    verify_tool(app, Tool::FFprobe, bin_dir).await?;

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

    download_file(app, url, &dest, names).await?;

    // Set executable on unix.
    #[cfg(unix)]
    set_executable(&dest)?;

    // Verify.
    emit_to_names(
        app,
        names,
        InstallProgressStatus::Verifying,
        0.0,
        "Verifying binary…",
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
    url: &str,
    dest: &Path,
    event_names: &[&str],
) -> Result<(), InstallError> {
    emit_to_names(
        app,
        event_names,
        InstallProgressStatus::Downloading,
        0.0,
        &format!("Downloading from {url}"),
    );

    let client = reqwest::Client::builder()
        .user_agent("TheAtlas-Media/0.0.1")
        .build()
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))?;

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

    // Stream chunks for real-time progress.
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
            let msg = format!(
                "{:.1} MB / {:.1} MB",
                downloaded as f64 / 1_048_576.0,
                total_size as f64 / 1_048_576.0
            );
            emit_to_names(
                app,
                event_names,
                InstallProgressStatus::Downloading,
                progress,
                &msg,
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| InstallError::FsError(e.to_string()))?;

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
        "ffmpeg" | "ffprobe" => Ok(DownloadTarget::FfmpegBundle),
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
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))?;

    let resp = client
        .head(url)
        .send()
        .await
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))?;

    let bytes = resp.content_length().unwrap_or(0);
    let mb = bytes as f64 / 1_048_576.0;

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
