use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tokio::{io::AsyncReadExt, process::Command, time::timeout};

pub(crate) async fn compute_file_sha256(path: &Path) -> Result<String, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];

    loop {
        let n = file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DependencyStatus {
    Installed,
    NotInstalled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DependencySource {
    Env,
    Managed,
    Path,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyInfo {
    pub name: String,
    pub status: DependencyStatus,
    pub source: DependencySource,
    pub path: Option<String>,
    pub version: Option<String>,
    pub latest_version: Option<String>,
    pub size_mb: Option<f64>,
    pub sha256: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DependencyPaths {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub ytdlp: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyReport {
    pub ffmpeg: DependencyInfo,
    pub ffprobe: DependencyInfo,
    pub ytdlp: DependencyInfo,
    pub all_installed: bool,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Tool {
    FFmpeg,
    FFprobe,
    YTdlp,
}

impl Tool {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Tool::FFmpeg => "ffmpeg",
            Tool::FFprobe => "ffprobe",
            Tool::YTdlp => "yt-dlp",
        }
    }

    fn env_var(self) -> &'static str {
        match self {
            Tool::FFmpeg => "THEATLAS_FFMPEG_PATH",
            Tool::FFprobe => "THEATLAS_FFPROBE_PATH",
            Tool::YTdlp => "THEATLAS_YTDLP_PATH",
        }
    }

    pub(crate) fn exe_name(self) -> &'static str {
        match self {
            Tool::FFmpeg => {
                if cfg!(windows) {
                    "ffmpeg.exe"
                } else {
                    "ffmpeg"
                }
            }
            Tool::FFprobe => {
                if cfg!(windows) {
                    "ffprobe.exe"
                } else {
                    "ffprobe"
                }
            }
            Tool::YTdlp => {
                if cfg!(windows) {
                    "yt-dlp.exe"
                } else {
                    "yt-dlp"
                }
            }
        }
    }

    fn version_args(self) -> &'static [&'static str] {
        match self {
            Tool::FFmpeg => &["-version"],
            Tool::FFprobe => &["-version"],
            Tool::YTdlp => &["--version"],
        }
    }
}

#[tauri::command]
pub async fn check_installed_dependencies(app: AppHandle) -> Result<DependencyStatus, String> {
    let report = check_dependencies(app).await?;

    if report.all_installed {
        Ok(DependencyStatus::Installed)
    } else {
        Ok(DependencyStatus::NotInstalled)
    }
}

#[tauri::command]
pub async fn check_dependencies(app: AppHandle) -> Result<DependencyReport, String> {
    let mut ffmpeg = check_tool(&app, Tool::FFmpeg).await;
    let mut ffprobe = check_tool(&app, Tool::FFprobe).await;
    let mut ytdlp = check_tool(&app, Tool::YTdlp).await;

    if let Ok(base) = app.path().app_local_data_dir() {
        let cache_path = base.join("update_cache.json");
        if let Ok(content) = tokio::fs::read_to_string(&cache_path).await {
            if let Ok(cache) = serde_json::from_str::<super::update::UpdateCache>(&content) {
                ytdlp.latest_version = cache.ytdlp_tag;
                ffmpeg.latest_version = cache.ffmpeg_tag.clone();
                ffprobe.latest_version = cache.ffmpeg_tag;
            }
        }
    }

    let all_installed = matches!(ffmpeg.status, DependencyStatus::Installed)
        && matches!(ffprobe.status, DependencyStatus::Installed)
        && matches!(ytdlp.status, DependencyStatus::Installed);

    Ok(DependencyReport {
        ffmpeg,
        ffprobe,
        ytdlp,
        all_installed,
    })
}

pub async fn get_dependency_paths(app: &AppHandle) -> Result<DependencyPaths, String> {
    let ffmpeg = resolve_tool(app, Tool::FFmpeg)
        .await
        .ok_or_else(|| "ffmpeg is not installed".to_string())?;

    let ffprobe = resolve_tool(app, Tool::FFprobe)
        .await
        .ok_or_else(|| "ffprobe is not installed".to_string())?;

    let ytdlp = resolve_tool(app, Tool::YTdlp)
        .await
        .ok_or_else(|| "yt-dlp is not installed".to_string())?;
    Ok(DependencyPaths {
        ffmpeg,
        ffprobe,
        ytdlp,
    })
}

#[tauri::command]
pub async fn get_app_storage_size_mb(app: AppHandle) -> Result<f64, String> {
    let Ok(base) = app.path().app_local_data_dir() else {
        return Ok(0.0);
    };

    if !base.exists() {
        return Ok(0.0);
    }

    let mut total_bytes: u64 = 0;
    let mut stack = vec![base];

    while let Some(dir) = stack.pop() {
        if let Ok(mut read_dir) = tokio::fs::read_dir(&dir).await {
            while let Ok(Some(entry)) = read_dir.next_entry().await {
                if let Ok(file_type) = entry.file_type().await {
                    if file_type.is_dir() {
                        stack.push(entry.path());
                    } else if file_type.is_file() {
                        if let Ok(metadata) = entry.metadata().await {
                            total_bytes += metadata.len();
                        }
                    }
                }
            }
        }
    }

    Ok(total_bytes as f64 / 1_048_576.0)
}

pub(crate) async fn check_tool(app: &AppHandle, tool: Tool) -> DependencyInfo {
    let candidates = candidate_paths(app, tool);

    for candidate in candidates {
        if !candidate.path.exists() {
            continue;
        }

        match read_version(&candidate.path, tool).await {
            Ok(version) => {
                let size_mb = tokio::fs::metadata(&candidate.path)
                    .await
                    .map(|m| m.len() as f64 / 1_048_576.0)
                    .ok();
                let sha256 = compute_file_sha256(&candidate.path).await.ok();

                return DependencyInfo {
                    name: tool.name().to_string(),
                    status: DependencyStatus::Installed,
                    source: candidate.source,
                    path: Some(candidate.path.to_string_lossy().to_string()),
                    version: Some(version),
                    latest_version: None,
                    size_mb,
                    sha256,
                    error: None,
                };
            }
            Err(error) => {
                return DependencyInfo {
                    name: tool.name().to_string(),
                    status: DependencyStatus::NotInstalled,
                    source: candidate.source,
                    path: Some(candidate.path.to_string_lossy().to_string()),
                    version: None,
                    latest_version: None,
                    size_mb: None,
                    sha256: None,
                    error: Some(error),
                };
            }
        }
    }

    DependencyInfo {
        name: tool.name().to_string(),
        status: DependencyStatus::NotInstalled,
        source: DependencySource::Missing,
        path: None,
        version: None,
        latest_version: None,
        size_mb: None,
        sha256: None,
        error: Some(format!("{} was not found", tool.name())),
    }
}

async fn resolve_tool(app: &AppHandle, tool: Tool) -> Option<PathBuf> {
    let candidates = candidate_paths(app, tool);

    for candidate in candidates {
        if !candidate.path.exists() {
            continue;
        }

        if read_version(&candidate.path, tool).await.is_ok() {
            return Some(candidate.path);
        }
    }

    None
}

#[derive(Debug, Clone)]
struct CandidatePath {
    path: PathBuf,
    source: DependencySource,
}

fn candidate_paths(app: &AppHandle, tool: Tool) -> Vec<CandidatePath> {
    let mut paths = Vec::new();

    if let Ok(value) = env::var(tool.env_var()) {
        if !value.trim().is_empty() {
            paths.push(CandidatePath {
                path: PathBuf::from(value),
                source: DependencySource::Env,
            });
        }
    }

    if let Ok(managed_dir) = managed_bin_dir(app) {
        paths.push(CandidatePath {
            path: managed_dir.join(tool.exe_name()),
            source: DependencySource::Managed,
        })
    }

    for path in find_in_path(tool.exe_name()) {
        paths.push(CandidatePath {
            path,
            source: DependencySource::Path,
        })
    }

    paths
}

pub(crate) fn managed_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|err| err.to_string())?;

    Ok(base.join("bin").join(platform_dir_name()))
}

fn platform_dir_name() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "windows-x86_64"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "windows-aarch64"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "macos-x86_64"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "macos-aarch64"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "linux-x86_64"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "linux-aarch64"
    } else {
        "unknown"
    }
}

fn find_in_path(exe_name: &str) -> Vec<PathBuf> {
    let Some(path_var) = env::var_os("PATH") else {
        return Vec::new();
    };

    env::split_paths(&path_var)
        .map(|d| d.join(exe_name))
        .collect()
}

pub(crate) async fn read_version(path: &Path, tool: Tool) -> Result<String, String> {
    let mut command = Command::new(path);
    command.args(tool.version_args());
    command.kill_on_drop(true);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = timeout(Duration::from_secs(8), command.output())
        .await
        .map_err(|_| format!("{} version check timed out", tool.name()))?
        .map_err(|err| {
            format!(
                "failed to run {} at {}: {}",
                tool.name(),
                path.to_string_lossy(),
                err
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        return Err(format!(
            "{} exited with status {}: {}",
            tool.name(),
            output.status,
            stderr
        ));
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    let combined = if stdout.is_empty() { stderr } else { stdout };

    parse_version_line(tool, &combined)
}

fn parse_version_line(tool: Tool, text: &str) -> Result<String, String> {
    let first_line = text
        .lines()
        .next()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .ok_or_else(|| format!("{} returned empty version output", tool.name()))?;

    Ok(first_line.to_string())
}
