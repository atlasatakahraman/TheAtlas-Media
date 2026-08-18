use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use super::dependency::{check_dependencies, DependencySource, DependencyStatus};
use super::install::InstallError;

const CHECK_INTERVAL_SECS: u64 = 12 * 3600; // 12 hours

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateCache {
    pub last_check_timestamp: u64,
    pub ytdlp_tag: Option<String>,
    pub ffmpeg_tag: Option<String>,
    /// Unix seconds when the latest BtbN FFmpeg release was published.
    /// BtbN's "latest" release tag is the literal string "latest", so tag
    /// comparison can't detect an update — freshness is judged by comparing
    /// this against the managed binary's mtime instead (see dependency.rs).
    pub ffmpeg_published_at: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    /// RFC 3339 timestamp, e.g. "2026-06-01T12:34:56Z".
    published_at: Option<String>,
}

/// Check for dependency updates. This is a metadata-only operation: it
/// fetches upstream release info and writes it to the cache, but never
/// downloads or installs anything. Installing is always a separate,
/// explicit, user-confirmed action (see commands::install).
#[tauri::command]
pub async fn check_for_updates(app: AppHandle, force: bool) -> Result<(), InstallError> {
    run_update_check(&app, force).await
}

/// Core function that runs non-blockingly on app startup. Purely refreshes
/// the update-metadata cache — it never installs anything, and it never
/// touches a tool whose active source isn't `Managed` (external installs
/// are never claimed stale and are never auto-updated).
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

    log::info!("Running dependency update metadata check...");

    let report = check_dependencies(app.clone())
        .await
        .map_err(InstallError::DownloadFailed)?;

    let client = reqwest::Client::builder()
        .user_agent("TheAtlas-Media/0.0.1")
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| InstallError::DownloadFailed(e.to_string()))?;

    // Only refresh upstream metadata for tools the app actually manages.
    // There's no point tracking a version target for a binary the app
    // doesn't own and will never touch.
    let ytdlp_is_managed = matches!(report.ytdlp.status, DependencyStatus::Installed)
        && report.ytdlp.source == DependencySource::Managed;
    let ffmpeg_is_managed = matches!(report.ffmpeg.status, DependencyStatus::Installed)
        && report.ffmpeg.source == DependencySource::Managed;

    if ytdlp_is_managed {
        if let Ok(release) = fetch_latest_release(&client, "yt-dlp/yt-dlp").await {
            cache.ytdlp_tag = Some(release.tag_name);
        }
    }

    if ffmpeg_is_managed {
        if let Ok(release) = fetch_latest_release(&client, "BtbN/FFmpeg-Builds").await {
            cache.ffmpeg_tag = Some(release.tag_name);
            if let Some(published_at) = release.published_at.as_deref() {
                if let Some(secs) = parse_rfc3339_to_unix_secs(published_at) {
                    cache.ffmpeg_published_at = Some(secs);
                }
            }
        }
    }

    cache.last_check_timestamp = now;
    let _ = save_cache(&cache_path, &cache).await;

    Ok(())
}

async fn fetch_latest_release(
    client: &reqwest::Client,
    repo: &str,
) -> Result<GithubRelease, String> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<GithubRelease>()
        .await
        .map_err(|e| e.to_string())
}

/// Parse a fixed-width GitHub API RFC-3339 UTC timestamp
/// ("YYYY-MM-DDTHH:MM:SSZ") into unix seconds, without pulling in a date
/// library for one field. GitHub's API always emits this exact form.
fn parse_rfc3339_to_unix_secs(s: &str) -> Option<u64> {
    let bytes = s.as_bytes();
    if bytes.len() < 20 || bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' {
        return None;
    }

    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let minute: i64 = s.get(14..16)?.parse().ok()?;
    let second: i64 = s.get(17..19)?.parse().ok()?;

    // Days since the Unix epoch via the standard civil-from-days algorithm
    // (Howard Hinnant's `days_from_civil`), then combine with time-of-day.
    let days = days_from_civil(year, month, day);
    let total_secs = days * 86_400 + hour * 3_600 + minute * 60 + second;

    u64::try_from(total_secs).ok()
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
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
