//! Media job commands: metadata/file probes, the download and convert job
//! queue, history, output-directory resolution, and reveal-in-folder.
//!
//! Thin adapters plus one dispatcher, following `commands::install`'s shape:
//! `enqueue_*` registers a job and returns immediately, `dispatch` pulls
//! queued jobs while a concurrency slot is free, and `run_job` drives one job
//! to completion, publishing `media:job` (status transitions) and
//! `media:progress:{id}` (throttled ticks) events along the way.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::Command;
use tokio::sync::watch;
use tokio::time::timeout;

use crate::core::media::engine::JobSpec;
use crate::core::media::spawn::{spawn_streamed, SpawnRequest};
use crate::core::media::types::{
    ConvertSpec, DownloadSpec, JobId, JobProgress, JobSnapshot, JobStatus, MediaProbe,
    VideoMetadata,
};
use crate::core::media::{ffmpeg_tool, ffprobe, history, validate, ytdlp};
use crate::core::tools::download::{format_speed, ProgressThrottle};
use crate::core::tools::probe;
use crate::core::tools::registry;
use crate::error::{AppError, AppResult};
use crate::state::{AppState, State};
use crate::sys;

/// Generous for a JSON dump or a codec probe — longer than `VERSION_TIMEOUT`
/// in `probe.rs`, since `--dump-single-json` genuinely does more work than a
/// `--version` flag.
const PROBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn tool_spec(name: &str) -> AppResult<&'static registry::ToolSpec> {
    registry::tool(name).ok_or_else(|| AppError::internal(format!("'{name}' is not registered")))
}

/// One-shot, non-streaming subprocess call — the shape `probe::read_version`
/// uses for `--version`, reused here for `--dump-single-json` and ffprobe's
/// JSON dump, neither of which needs progress.
async fn run_probe(program: &Path, args: &[String]) -> AppResult<String> {
    let mut command = Command::new(program);
    command.args(args);
    command.kill_on_drop(true);

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = timeout(PROBE_TIMEOUT, command.output())
        .await
        .map_err(|_| AppError::subprocess(format!("{} timed out", program.display())))?
        .map_err(|error| {
            AppError::subprocess(format!("failed to run {}: {error}", program.display()))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::subprocess(format!(
            "{} exited with status {}: {stderr}",
            program.display(),
            output.status
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn probe_media_url(state: State<'_>, url: String) -> AppResult<VideoMetadata> {
    validate::url(&url)?;

    let spec = tool_spec("ytdlp")?;
    let ctx = state.resolve_ctx().await;
    let path = probe::resolve_tool(spec, &ctx, &state.probe)
        .await
        .ok_or_else(|| AppError::not_found("yt-dlp is not installed"))?;

    let args = ytdlp::build_probe_args(&url);
    let stdout = run_probe(&path, &args).await?;
    ytdlp::parse_metadata_json(&stdout)
}

#[tauri::command]
pub async fn probe_media_file(state: State<'_>, path: String) -> AppResult<MediaProbe> {
    let input = Path::new(path.trim());
    if input.as_os_str().is_empty() {
        return Err(AppError::validation("no path given"));
    }

    let spec = tool_spec("ffprobe")?;
    let ctx = state.resolve_ctx().await;
    let ffprobe_path = probe::resolve_tool(spec, &ctx, &state.probe)
        .await
        .ok_or_else(|| AppError::not_found("ffprobe is not installed"))?;

    let args = ffprobe::build_probe_args(input);
    let stdout = run_probe(&ffprobe_path, &args).await?;
    ffprobe::parse_probe_json(&stdout, input)
}

// ---------------------------------------------------------------------------
// Job lifecycle
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn enqueue_download(
    app: AppHandle,
    state: State<'_>,
    spec: DownloadSpec,
) -> AppResult<JobId> {
    validate::download_spec(&spec)?;
    let is_dir = tokio::fs::metadata(&spec.output_dir)
        .await
        .map(|meta| meta.is_dir())
        .unwrap_or(false);
    if !is_dir {
        return Err(AppError::validation("output directory does not exist"));
    }

    let id = state.media.enqueue(JobSpec::Download(spec));
    if let Some(snapshot) = state.media.snapshot(id) {
        emit_job(&app, snapshot);
    }
    dispatch(app, Arc::clone(state.inner()));
    Ok(id)
}

#[tauri::command]
pub async fn enqueue_convert(
    app: AppHandle,
    state: State<'_>,
    spec: ConvertSpec,
) -> AppResult<JobId> {
    validate::convert_spec(&spec)?;
    let is_file = tokio::fs::metadata(&spec.input_path)
        .await
        .map(|meta| meta.is_file())
        .unwrap_or(false);
    if !is_file {
        return Err(AppError::validation("input file does not exist"));
    }
    let is_dir = tokio::fs::metadata(&spec.output_dir)
        .await
        .map(|meta| meta.is_dir())
        .unwrap_or(false);
    if !is_dir {
        return Err(AppError::validation("output directory does not exist"));
    }

    let id = state.media.enqueue(JobSpec::Convert(spec));
    if let Some(snapshot) = state.media.snapshot(id) {
        emit_job(&app, snapshot);
    }
    dispatch(app, Arc::clone(state.inner()));
    Ok(id)
}

#[tauri::command]
pub async fn cancel_media_job(state: State<'_>, id: JobId) -> AppResult<bool> {
    Ok(state.media.cancel(id))
}

#[tauri::command]
pub async fn list_media_jobs(state: State<'_>) -> AppResult<Vec<JobSnapshot>> {
    Ok(state.media.list())
}

#[tauri::command]
pub async fn get_media_history(state: State<'_>) -> AppResult<Vec<JobSnapshot>> {
    Ok(history::load(&state.paths.media_history).await.entries)
}

#[tauri::command]
pub async fn clear_media_history(state: State<'_>) -> AppResult<()> {
    history::clear(&state.paths.media_history).await
}

#[tauri::command]
pub async fn set_media_concurrency(state: State<'_>, value: u32) -> AppResult<()> {
    let clamped = value.clamp(1, 4);
    state.kv.set("media", "concurrency", json!(clamped)).await?;
    state.media.set_limit(clamped as usize);
    Ok(())
}

/// The user's OS Downloads folder plus an app sub-directory, created if it
/// does not exist yet. `tauri::path`'s resolver, not `AppPaths` — this is a
/// user-facing destination, not app-owned storage.
#[tauri::command]
pub async fn get_default_media_output_dir(app: AppHandle) -> AppResult<String> {
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| AppError::not_found(format!("no downloads directory: {error}")))?;
    let dir = downloads.join("TheAtlas Media");
    tokio::fs::create_dir_all(&dir).await?;
    Ok(dir.to_string_lossy().to_string())
}

/// Reveal a finished job's output file. Only a path this backend already
/// reported — as a live job's `outputPath` or a history entry's — may be
/// revealed, mirroring `storage::reveal_dependency_path`'s "must match
/// something we already know" guard.
#[tauri::command]
pub async fn reveal_output_file(state: State<'_>, path: String) -> AppResult<()> {
    let requested = path.trim();
    if requested.is_empty() {
        return Err(AppError::validation("no path given"));
    }

    let known_live = state
        .media
        .list()
        .iter()
        .any(|job| job.output_path.as_deref() == Some(requested));
    let known_history = history::load(&state.paths.media_history)
        .await
        .entries
        .iter()
        .any(|job| job.output_path.as_deref() == Some(requested));

    if !known_live && !known_history {
        return Err(AppError::validation("that path is not a known job output"));
    }

    let target = PathBuf::from(requested);
    tokio::task::spawn_blocking(move || {
        if let Err(error) = sys::reveal_path(&target) {
            log::warn!("could not reveal the path: {error}");
        }
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

fn emit_job(app: &AppHandle, snapshot: JobSnapshot) {
    let _ = app.emit("media:job", snapshot);
}

fn emit_progress(app: &AppHandle, id: JobId, progress: JobProgress) {
    let _ = app.emit(&format!("media:progress:{id}"), progress);
}

/// Pulls queued jobs onto the runway while a concurrency slot is free.
/// Called right after every enqueue, and again by `run_job`'s `finally` the
/// moment a slot frees up.
fn dispatch(app: AppHandle, state: Arc<AppState>) {
    while let Some((id, spec, cancel_rx)) = state.media.try_start_next() {
        if let Some(snapshot) = state.media.snapshot(id) {
            emit_job(&app, snapshot);
        }
        tokio::spawn(run_job(
            app.clone(),
            Arc::clone(&state),
            id,
            spec,
            cancel_rx,
        ));
    }
}

async fn run_job(
    app: AppHandle,
    state: Arc<AppState>,
    id: JobId,
    spec: JobSpec,
    cancel_rx: watch::Receiver<bool>,
) {
    let result = match &spec {
        JobSpec::Download(download) => run_download(&app, &state, id, download, cancel_rx).await,
        JobSpec::Convert(convert) => run_convert(&app, &state, id, convert, cancel_rx).await,
    };

    match result {
        Ok(output_path) => {
            state.media.patch(id, |snapshot| {
                snapshot.status = JobStatus::Completed;
                snapshot.output_path = Some(output_path);
                snapshot.finished_at = Some(now_unix_secs());
            });
        }
        Err(error) => {
            let cancelled =
                matches!(&error, AppError::Subprocess(message) if message == "cancelled");
            if !cancelled {
                log::warn!("media job {id} failed: {error}");
            }
            state.media.patch(id, |snapshot| {
                snapshot.status = if cancelled {
                    JobStatus::Cancelled
                } else {
                    JobStatus::Failed
                };
                snapshot.error = if cancelled {
                    None
                } else {
                    Some(error.to_string())
                };
                snapshot.finished_at = Some(now_unix_secs());
            });
        }
    }

    if let Some(snapshot) = state.media.snapshot(id) {
        emit_job(&app, snapshot.clone());
        if let Err(error) = history::append_entry(&state.paths.media_history, snapshot).await {
            log::warn!("could not write media job history: {error}");
        }
    }

    state.media.mark_finished(id);
    dispatch(app, state);
}

async fn run_download(
    app: &AppHandle,
    state: &Arc<AppState>,
    id: JobId,
    spec: &DownloadSpec,
    cancel_rx: watch::Receiver<bool>,
) -> AppResult<String> {
    let ctx = state.resolve_ctx().await;
    let ytdlp_spec = tool_spec("ytdlp")?;
    let ffmpeg_spec = tool_spec("ffmpeg")?;

    let ytdlp_path = probe::resolve_tool(ytdlp_spec, &ctx, &state.probe)
        .await
        .ok_or_else(|| AppError::not_found("yt-dlp is not installed"))?;
    let ffmpeg_path = probe::resolve_tool(ffmpeg_spec, &ctx, &state.probe)
        .await
        .ok_or_else(|| AppError::not_found("ffmpeg is not installed"))?;
    let ffmpeg_dir = ffmpeg_path.parent().unwrap_or_else(|| Path::new("."));

    let args = ytdlp::build_download_args(spec, ffmpeg_dir);

    let final_path = Arc::new(Mutex::new(None::<String>));
    let final_path_writer = Arc::clone(&final_path);
    let media = Arc::clone(&state.media);
    let app_for_stdout = app.clone();
    let mut throttle = ProgressThrottle::new(Instant::now());

    let on_stdout = move |line: &str| {
        if let Some(path) = ytdlp::parse_final_path(line) {
            *final_path_writer.lock().unwrap_or_else(|e| e.into_inner()) = Some(path.to_string());
            return;
        }

        let Some(tick) = ytdlp::parse_progress_line(line) else {
            return;
        };

        if tick.status == "finished" {
            media.patch(id, |snapshot| {
                snapshot.status = JobStatus::Finalizing;
                snapshot.progress = JobProgress {
                    message: "Finalizing".to_string(),
                    ..Default::default()
                };
            });
            if let Some(snapshot) = media.snapshot(id) {
                emit_job(&app_for_stdout, snapshot);
            }
            return;
        }

        let percent = match (tick.downloaded_bytes, tick.total_bytes) {
            (Some(downloaded), Some(total)) if total > 0 => {
                Some((downloaded as f64 / total as f64) * 100.0)
            }
            _ => None,
        };

        let Some(speed) = throttle.tick(
            tick.downloaded_bytes.unwrap_or(0),
            percent.unwrap_or(0.0),
            Instant::now(),
        ) else {
            return;
        };

        let progress = JobProgress {
            percent,
            downloaded_bytes: tick.downloaded_bytes,
            total_bytes: tick.total_bytes,
            speed_bps: Some(speed),
            eta_secs: tick.eta_secs,
            message: format_speed(speed),
        };
        media.patch(id, |snapshot| snapshot.progress = progress.clone());
        emit_progress(&app_for_stdout, id, progress);
    };

    spawn_streamed(
        SpawnRequest {
            program: &ytdlp_path,
            args: &args,
        },
        cancel_rx,
        on_stdout,
        |_line| {},
    )
    .await?;

    let resolved = final_path.lock().unwrap_or_else(|e| e.into_inner()).clone();
    resolved.ok_or_else(|| AppError::subprocess("yt-dlp did not report a final output path"))
}

async fn run_convert(
    app: &AppHandle,
    state: &Arc<AppState>,
    id: JobId,
    spec: &ConvertSpec,
    cancel_rx: watch::Receiver<bool>,
) -> AppResult<String> {
    let ctx = state.resolve_ctx().await;
    let ffmpeg_spec = tool_spec("ffmpeg")?;
    let ffprobe_spec = tool_spec("ffprobe")?;

    let ffmpeg_path = probe::resolve_tool(ffmpeg_spec, &ctx, &state.probe)
        .await
        .ok_or_else(|| AppError::not_found("ffmpeg is not installed"))?;

    let input_path = Path::new(&spec.input_path);

    // A missing or unreadable duration degrades the job to an indeterminate
    // progress bar rather than failing it — the transcode itself does not
    // need ffprobe to succeed.
    let duration_secs = match probe::resolve_tool(ffprobe_spec, &ctx, &state.probe).await {
        Some(ffprobe_path) => {
            let args = ffprobe::build_probe_args(input_path);
            match run_probe(&ffprobe_path, &args).await {
                Ok(stdout) => ffprobe::parse_probe_json(&stdout, input_path)
                    .ok()
                    .and_then(|probe| probe.duration_secs),
                Err(_) => None,
            }
        }
        None => None,
    };

    let stem = input_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "output".to_string());
    let output_path = Path::new(&spec.output_dir).join(format!("{stem}.{}", spec.container));

    let args = ffmpeg_tool::build_transcode_args(spec, &output_path);

    let media = Arc::clone(&state.media);
    let app_for_stdout = app.clone();
    let mut throttle = ProgressThrottle::new(Instant::now());
    let mut block_lines: Vec<String> = Vec::new();

    let on_stdout = move |line: &str| {
        block_lines.push(line.to_string());
        if !line.starts_with("progress=") {
            return;
        }

        let refs: Vec<&str> = block_lines.iter().map(|s| s.as_str()).collect();
        let tick = ffmpeg_tool::parse_progress_block(&refs);
        block_lines.clear();

        let percent = duration_secs.and_then(|duration| ffmpeg_tool::percent_from(&tick, duration));

        let Some(_) = throttle.tick(0, percent.unwrap_or(0.0), Instant::now()) else {
            return;
        };

        let progress = JobProgress {
            percent,
            downloaded_bytes: None,
            total_bytes: None,
            speed_bps: tick.speed,
            eta_secs: None,
            message: tick.speed.map(|s| format!("{s:.2}x")).unwrap_or_default(),
        };
        media.patch(id, |snapshot| snapshot.progress = progress.clone());
        emit_progress(&app_for_stdout, id, progress);
    };

    spawn_streamed(
        SpawnRequest {
            program: &ffmpeg_path,
            args: &args,
        },
        cancel_rx,
        on_stdout,
        |_line| {},
    )
    .await?;

    Ok(output_path.to_string_lossy().to_string())
}
