//! Install, uninstall, and download-size commands.
//!
//! Each install command groups the requested tool names by bundle, spawns one
//! background job per bundle, and returns immediately. Progress arrives as
//! `install-progress` events, so a long download never blocks the IPC call —
//! a blocked call is indistinguishable from a hang to the person looking at it.

use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use crate::core::tools::download::probe_content_length;
use crate::core::tools::install::{
    install_bundle, uninstall_tool, InstallProgress, InstallRequest, InstallStage,
};
use crate::core::tools::registry::{self, BundleSpec, ToolSpec};
use crate::core::tools::types::DependencyStatus;
use crate::core::tools::verify::now_unix_secs;
use crate::error::{AppError, AppResult};
use crate::state::{AppState, State};

/// Install one tool by name.
#[tauri::command]
pub async fn install_dependency(app: AppHandle, state: State<'_>, name: String) -> AppResult<()> {
    start_jobs(&app, &state, &[name]).await
}

/// Install several tools. Tools that share a bundle share one download —
/// asking for ffmpeg and ffprobe fetches the BtbN archive once.
#[tauri::command]
pub async fn install_tools(app: AppHandle, state: State<'_>, names: Vec<String>) -> AppResult<()> {
    start_jobs(&app, &state, &names).await
}

/// Install whatever is currently missing.
#[tauri::command]
pub async fn install_all_missing(app: AppHandle, state: State<'_>) -> AppResult<()> {
    let report = super::dependency::build_report(&state).await?;

    let mut names = Vec::new();
    for (info, key) in [
        (&report.ffmpeg, "ffmpeg"),
        (&report.ffprobe, "ffprobe"),
        (&report.ytdlp, "ytdlp"),
    ] {
        if info.status == DependencyStatus::NotInstalled {
            names.push(key.to_string());
        }
    }

    start_jobs(&app, &state, &names).await
}

/// Remove a tool's managed copy.
///
/// Only ever touches the managed directory. A binary the user installed
/// themselves is never deleted by this app, whatever the resolver currently
/// prefers.
#[tauri::command]
pub async fn uninstall_dependency(state: State<'_>, name: String) -> AppResult<()> {
    let spec = registry::tool(&name)
        .ok_or_else(|| AppError::validation(format!("unknown dependency: {name}")))?;

    uninstall_tool(spec, &state.paths.managed_bin).await?;
    state.probe.invalidate();

    Ok(())
}

/// Size of a tool's download, in MB. `0.0` when the server will not say.
#[tauri::command]
pub async fn get_download_size_mb(state: State<'_>, name: String) -> AppResult<f64> {
    let spec = registry::tool(&name)
        .ok_or_else(|| AppError::validation(format!("unknown dependency: {name}")))?;

    let build = spec
        .bundle()
        .and_then(|bundle| bundle.current_build())
        .ok_or(AppError::UnsupportedPlatform)?;

    let bytes = probe_content_length(&state.http, build.url).await?;
    Ok(bytes as f64 / 1_048_576.0)
}

// `get_all_download_sizes_mb` used to live here. Nothing called it: the
// frontend's keyed resource already fetches sizes concurrently through
// `get_download_size_mb`, one key at a time. An IPC command with no caller is
// attack surface with no benefit, so it is gone rather than kept "just in
// case" — the batching it offered is a `JoinSet` away if it is ever wanted.

// ---------------------------------------------------------------------------
// Job orchestration
// ---------------------------------------------------------------------------

/// Turn a list of names into one background job per bundle.
async fn start_jobs(app: &AppHandle, state: &Arc<AppState>, names: &[String]) -> AppResult<()> {
    let groups = registry::group_by_bundle(names);

    if groups.is_empty() && !names.is_empty() {
        return Err(AppError::validation(format!(
            "no installable tool matched {names:?}"
        )));
    }

    for (bundle, tools) in groups {
        let app = app.clone();
        let state = Arc::clone(state);

        tokio::spawn(async move {
            if let Err(error) = run_job(&app, &state, bundle, &tools).await {
                emit(&app, &tools, InstallStage::Failed, 0.0, &error.to_string());
                log::error!("install of '{}' failed: {error}", bundle.key);
            }
        });
    }

    Ok(())
}

async fn run_job(
    app: &AppHandle,
    state: &Arc<AppState>,
    bundle: &'static BundleSpec,
    tools: &[&'static ToolSpec],
) -> AppResult<()> {
    let outcome = install_bundle(
        InstallRequest {
            bundle,
            tools: tools.to_vec(),
            bin_dir: &state.paths.managed_bin,
            http: &state.http,
            cache: &state.probe,
        },
        |stage, percent, message| emit(app, tools, stage, percent, message.as_str()),
    )
    .await?;

    // Record what landed. An audit trail, not a gate — see the module docs on
    // `core::tools::verify` for why a rolling `latest` tag cannot support one.
    let mut journal = state.artifact_journal().await;
    if journal.record(&outcome.artifact, &outcome.sha256, now_unix_secs()) {
        log::info!(
            "{} changed upstream — new SHA-256 {}",
            outcome.artifact,
            outcome.sha256
        );
    }
    if let Err(error) = state.save_artifact_journal(&journal).await {
        // Losing the journal must not fail an install that already succeeded.
        log::warn!("could not write the artifact journal: {error}");
    }

    log::info!(
        "installed {:?} from {} ({} bytes)",
        outcome.installed,
        outcome.artifact,
        outcome.bytes
    );

    Ok(())
}

/// Publish one progress tick per tool.
///
/// One global `install-progress` event that the frontend filters by name.
/// `Rust-Tauri/06` prescribes scoped `progress:{job_id}` events instead, which
/// matters when many jobs run at once; with at most two concurrent bundle
/// installs it would be ceremony. Flagged for the download queue, which will
/// genuinely need it.
fn emit(
    app: &AppHandle,
    tools: &[&'static ToolSpec],
    stage: InstallStage,
    progress: f64,
    message: &str,
) {
    for tool in tools {
        let _ = app.emit(
            "install-progress",
            InstallProgress {
                name: tool.key.to_string(),
                status: stage,
                progress,
                message: message.to_string(),
            },
        );
    }
}
