//! Upstream release-metadata checks.
//!
//! Metadata only. This never downloads or installs anything — installing is
//! always a separate, explicitly confirmed action. It also never looks at a
//! tool the app does not manage: there is no point tracking a version target
//! for a binary this app will never touch.

use std::sync::Arc;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::core::tools::download::fetch_text;
use crate::core::tools::freshness::{now_unix_secs, parse_rfc3339_to_unix_secs, UpdateCache};
use crate::core::tools::types::{DependencySource, DependencyStatus};
use crate::error::AppResult;
use crate::state::{read_json_or_default, write_json, AppState, State};

/// How long a check stays fresh. Startup checks respect it; the button does not.
const CHECK_INTERVAL_SECS: u64 = 12 * 3_600;

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    /// RFC 3339, e.g. "2026-06-01T12:34:56Z".
    published_at: Option<String>,
}

#[tauri::command]
pub async fn check_for_updates(state: State<'_>, force: bool) -> AppResult<()> {
    run_update_check(&state, force).await
}

/// Also called once at startup, off the main thread.
pub async fn run_update_check(state: &Arc<AppState>, force: bool) -> AppResult<()> {
    let now = now_unix_secs();
    let mut cache: UpdateCache = read_json_or_default(&state.paths.update_cache).await;

    if !force
        && now
            < cache
                .last_check_timestamp
                .saturating_add(CHECK_INTERVAL_SECS)
    {
        log::info!("skipping the update check — last one was under 12h ago");
        return Ok(());
    }

    let report = super::dependency::build_report(state).await?;

    let is_managed = |info: &crate::core::tools::types::DependencyInfo| {
        info.status == DependencyStatus::Installed && info.source == DependencySource::Managed
    };

    // A failed metadata fetch is not a failed command: the app is perfectly
    // usable offline, and turning "GitHub is unreachable" into an error toast
    // on every launch would be noise.
    if is_managed(&report.ytdlp) {
        match fetch_latest_release(state, "yt-dlp/yt-dlp").await {
            Ok(release) => cache.ytdlp_tag = Some(release.tag_name),
            Err(error) => log::info!("yt-dlp release metadata unavailable: {error}"),
        }
    }

    if is_managed(&report.ffmpeg) || is_managed(&report.ffprobe) {
        match fetch_latest_release(state, "BtbN/FFmpeg-Builds").await {
            Ok(release) => {
                cache.ffmpeg_tag = Some(release.tag_name);
                cache.ffmpeg_published_at = release
                    .published_at
                    .as_deref()
                    .and_then(parse_rfc3339_to_unix_secs)
                    .or(cache.ffmpeg_published_at);
            }
            Err(error) => log::info!("FFmpeg release metadata unavailable: {error}"),
        }
    }

    cache.last_check_timestamp = now;
    write_json(&state.paths.update_cache, &cache).await
}

async fn fetch_latest_release(state: &Arc<AppState>, repo: &str) -> AppResult<GithubRelease> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let body = fetch_text(&state.http, &url).await?;
    Ok(serde_json::from_str(&body)?)
}

/// Run the startup check without blocking `setup`.
pub fn spawn_startup_check(app: &AppHandle) {
    let Some(state) = app.try_state::<Arc<AppState>>() else {
        log::error!("app state is not registered — skipping the startup update check");
        return;
    };
    let state = Arc::clone(state.inner());

    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_update_check(&state, false).await {
            log::info!("startup update check did not complete: {error}");
        }
    });
}
