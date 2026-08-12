use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use super::dependency::{check_dependencies, DependencyStatus};
use super::install::{do_install, DownloadTarget, InstallError};

const CHECK_INTERVAL_SECS: u64 = 12 * 3600; // 12 hours

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateCache {
    pub last_check_timestamp: u64,
    pub ytdlp_tag: Option<String>,
    pub ffmpeg_tag: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle, force: bool) -> Result<(), InstallError> {
    run_update_check(&app, force).await
}

/// Core function that runs non-blockingly on app startup.
pub async fn run_update_check(app: &AppHandle, force: bool) -> Result<(), InstallError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let cache_path = cache_file_path(app)?;
    let mut cache = load_cache(&cache_path).await.unwrap_or_default();

    if !force && (now < cache.last_check_timestamp + CHECK_INTERVAL_SECS) {
        log::info!("Skipping startup update check (checked < 12h ago)");
        return Ok(());
    }

    log::info!("Running startup dependency update check...");

    let report = check_dependencies(app.clone())
        .await
        .map_err(InstallError::DownloadFailed)?;

    let client = reqwest::Client::builder()
        .user_agent("TheAtlas-Media/0.0.1")
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))?;

    // Check yt-dlp update
    if matches!(report.ytdlp.status, DependencyStatus::Installed) {
        if let Ok(latest_ytdlp) = fetch_latest_tag(&client, "yt-dlp/yt-dlp").await {
            let current_ver = report.ytdlp.version.as_deref().unwrap_or("");
            if !current_ver.contains(&latest_ytdlp) && !latest_ytdlp.is_empty() {
                log::info!(
                    "Updating yt-dlp: current='{}', latest='{}'",
                    current_ver,
                    latest_ytdlp
                );
                let _ = do_install(app, DownloadTarget::YtDlp).await;
            }
            cache.ytdlp_tag = Some(latest_ytdlp);
        }
    }

    // Check FFmpeg update
    if matches!(report.ffmpeg.status, DependencyStatus::Installed) {
        if let Ok(latest_ffmpeg) = fetch_latest_tag(&client, "BtbN/FFmpeg-Builds").await {
            cache.ffmpeg_tag = Some(latest_ffmpeg);
        }
    }

    cache.last_check_timestamp = now;
    let _ = save_cache(&cache_path, &cache).await;

    Ok(())
}

async fn fetch_latest_tag(client: &reqwest::Client, repo: &str) -> Result<String, String> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let release: GithubRelease = resp.json().await.map_err(|e| e.to_string())?;
    Ok(release.tag_name)
}

fn cache_file_path(app: &AppHandle) -> Result<std::path::PathBuf, InstallError> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| InstallError::FsError(e.to_string()))?;
    Ok(base.join("update_cache.json"))
}

async fn load_cache(path: &std::path::Path) -> Result<UpdateCache, std::io::Error> {
    let content = tokio::fs::read_to_string(path).await?;
    let cache: UpdateCache = serde_json::from_str(&content)?;
    Ok(cache)
}

async fn save_cache(path: &std::path::Path, cache: &UpdateCache) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    let content = serde_json::to_string_pretty(cache)?;
    tokio::fs::write(path, content).await
}
