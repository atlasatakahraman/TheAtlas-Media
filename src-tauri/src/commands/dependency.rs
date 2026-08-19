//! Dependency detection commands.
//!
//! Thin adapters: validate the name, load the resolution context, call
//! `core::tools::probe`, hand back the result. Anything with a decision in it
//! lives in `core/` and has a test.

use std::sync::Arc;

use crate::core::tools::freshness::{apply_publish_freshness, apply_tag_freshness, UpdateCache};
use crate::core::tools::probe::{
    apply_managed_probe, check_tool, probe_candidates, resolve_or_probe_managed,
};
use crate::core::tools::registry::{self, ToolSpec};
use crate::core::tools::types::{
    DependencyCandidate, DependencyInfo, DependencyReport, DependencyStatus,
};
use crate::error::{AppError, AppResult};
use crate::state::{read_json_or_default, AppState, State};

/// Resolve an IPC tool name, or explain what was wrong with it.
///
/// Every command that takes a `name` starts here. The webview is untrusted
/// input even when the webview is ours.
fn spec_for(name: &str) -> AppResult<&'static ToolSpec> {
    registry::tool(name).ok_or_else(|| AppError::validation(format!("unknown dependency: {name}")))
}

/// The full three-tool report the dependencies page renders.
#[tauri::command]
pub async fn check_dependencies(state: State<'_>) -> AppResult<DependencyReport> {
    build_report(&state).await
}

pub(crate) async fn build_report(state: &Arc<AppState>) -> AppResult<DependencyReport> {
    let ctx = state.resolve_ctx().await;
    let cache = &state.probe;

    let ffmpeg_spec = spec_for("ffmpeg")?;
    let ffprobe_spec = spec_for("ffprobe")?;
    let ytdlp_spec = spec_for("ytdlp")?;

    // Concurrent, not sequential: each of these spawns at least one
    // subprocess, and run one after another the report took the sum of three
    // version checks rather than the slowest one.
    let (mut ffmpeg, mut ffprobe, mut ytdlp) = tokio::join!(
        check_tool(ffmpeg_spec, &ctx, cache),
        check_tool(ffprobe_spec, &ctx, cache),
        check_tool(ytdlp_spec, &ctx, cache),
    );

    // The managed_* fields are filled regardless of which source is active:
    // the UI needs to know a managed copy exists even while an env override
    // or a PATH binary is shadowing it.
    let (ffmpeg_probe, ffprobe_probe, ytdlp_probe) = tokio::join!(
        resolve_or_probe_managed(ffmpeg_spec, &ctx, cache, &ffmpeg),
        resolve_or_probe_managed(ffprobe_spec, &ctx, cache, &ffprobe),
        resolve_or_probe_managed(ytdlp_spec, &ctx, cache, &ytdlp),
    );

    apply_managed_probe(&mut ffmpeg, &ffmpeg_probe);
    apply_managed_probe(&mut ffprobe, &ffprobe_probe);
    apply_managed_probe(&mut ytdlp, &ytdlp_probe);

    let update_cache: UpdateCache = read_json_or_default(&state.paths.update_cache).await;
    apply_tag_freshness(&mut ytdlp, update_cache.ytdlp_tag.as_deref());
    apply_publish_freshness(
        &mut ffmpeg,
        update_cache.ffmpeg_published_at,
        ffmpeg_probe.as_ref(),
    );
    apply_publish_freshness(
        &mut ffprobe,
        update_cache.ffmpeg_published_at,
        ffprobe_probe.as_ref(),
    );

    let all_installed = [&ffmpeg, &ffprobe, &ytdlp]
        .iter()
        .all(|info| info.status == DependencyStatus::Installed);

    Ok(DependencyReport {
        ffmpeg,
        ffprobe,
        ytdlp,
        all_installed,
    })
}

/// A one-value answer for callers that only need "can the app work yet".
#[tauri::command]
pub async fn check_installed_dependencies(state: State<'_>) -> AppResult<DependencyStatus> {
    let report = build_report(&state).await?;

    Ok(if report.all_installed {
        DependencyStatus::Installed
    } else {
        DependencyStatus::NotInstalled
    })
}

/// Re-check everything from scratch, discarding every cached probe.
#[tauri::command]
pub async fn check_dependency_paths(state: State<'_>) -> AppResult<DependencyReport> {
    state.probe.invalidate();
    build_report(&state).await
}

/// Every auto-detected path for a tool, for the "Change Path" picker.
///
/// Served from cache unless `refresh` is set. Probing is expensive — each
/// candidate spawns the binary — and a long `PATH` made opening the dialog
/// take seconds every time.
#[tauri::command]
pub async fn get_dependency_candidates(
    state: State<'_>,
    name: String,
    refresh: Option<bool>,
) -> AppResult<Vec<DependencyCandidate>> {
    let spec = spec_for(&name)?;

    if !refresh.unwrap_or(false) {
        if let Some(cached) = state.probe.cached_candidates(spec.key) {
            return Ok(cached);
        }
    }

    let ctx = state.resolve_ctx().await;
    let candidates = probe_candidates(spec, &ctx, &state.probe).await;
    state.probe.store_candidates(spec.key, &candidates);

    Ok(candidates)
}

/// Set — or with `path: None`, clear — the manual override for a tool.
///
/// A non-empty path has to exist *and* run as this tool before it is saved.
/// The picker cannot persist a dead link, so "I chose a path and now the tool
/// is broken" is not a reachable state.
#[tauri::command]
pub async fn set_dependency_override(
    state: State<'_>,
    name: String,
    path: Option<String>,
) -> AppResult<DependencyInfo> {
    let spec = spec_for(&name)?;

    let normalized = match path {
        Some(raw) if !raw.trim().is_empty() => {
            let trimmed = raw.trim().to_string();
            let candidate = std::path::PathBuf::from(&trimmed);

            if !candidate.is_file() {
                return Err(AppError::not_found(format!("{trimmed} is not a file")));
            }

            crate::core::tools::probe::read_version(&candidate, spec, &state.probe)
                .await
                .map_err(|error| {
                    AppError::validation(format!(
                        "that file does not run as {}: {error}",
                        spec.display_name
                    ))
                })?;

            Some(trimmed)
        }
        _ => None,
    };

    let mut prefs = state.resolve_ctx().await.prefs;
    prefs.set_path_for(spec.key, normalized);
    state.save_dependency_prefs(&prefs).await?;

    // Which copy wins has changed, so every cached probe is now a lie.
    state.probe.invalidate();

    let ctx = state.resolve_ctx().await;
    Ok(check_tool(spec, &ctx, &state.probe).await)
}
