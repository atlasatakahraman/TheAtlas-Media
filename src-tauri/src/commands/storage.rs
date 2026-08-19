//! App storage and webview cache commands.
//!
//! Split out of `dependency.rs`, where these had accumulated because the
//! dependencies page is the screen that shows them. They are about the app's
//! own disk footprint, not about finding a binary.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::core::store::disk::{bytes_to_mb, clear_dir_contents, dir_size_bytes};
use crate::error::{AppError, AppResult};
use crate::state::State;
use crate::sys;

/// Ignore a second folder-opening request within this window.
///
/// Double-clicking a "reveal" button used to open two Explorer windows, and on
/// a slow machine an impatient third click opened a third.
const OPEN_DEBOUNCE_MS: u64 = 800;

static LAST_OPEN_AT_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn open_is_allowed_now() -> bool {
    use std::sync::atomic::Ordering;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let last = LAST_OPEN_AT_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < OPEN_DEBOUNCE_MS {
        return false;
    }

    LAST_OPEN_AT_MS.store(now, Ordering::Relaxed);
    true
}

#[tauri::command]
pub async fn get_app_storage_path(state: State<'_>) -> AppResult<String> {
    Ok(state.paths.local_data.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_app_storage_size_mb(state: State<'_>) -> AppResult<f64> {
    Ok(bytes_to_mb(dir_size_bytes(&state.paths.local_data).await))
}

/// Open the app's data directory in the OS file manager.
#[tauri::command]
pub async fn open_app_storage_dir(state: State<'_>) -> AppResult<String> {
    let dir = state.paths.local_data.clone();
    tokio::fs::create_dir_all(&dir).await?;

    if open_is_allowed_now() {
        let for_task = dir.clone();
        // Spawning a file manager blocks until the shell has handed it off,
        // which on a cold Explorer is not instant.
        tokio::task::spawn_blocking(move || {
            if let Err(error) = sys::open_directory(&for_task) {
                log::warn!("could not open the storage directory: {error}");
            }
        });
    }

    Ok(dir.to_string_lossy().to_string())
}

/// Reveal a dependency binary in its containing folder.
///
/// The path is checked against the resolver's own view rather than opened as
/// given. The argument arrives from the webview, and "open this arbitrary path
/// in a shell handler" is not a capability this app needs to expose — the only
/// legitimate callers are the reveal buttons, which pass a path the backend
/// itself just reported.
#[tauri::command]
pub async fn reveal_dependency_path(state: State<'_>, path: String) -> AppResult<()> {
    let requested = PathBuf::from(path.trim());
    if requested.as_os_str().is_empty() {
        return Err(AppError::validation("no path given"));
    }

    let ctx = state.resolve_ctx().await;
    let known = crate::core::tools::registry::TOOLS.iter().any(|spec| {
        crate::core::tools::probe::candidate_paths(spec, &ctx)
            .iter()
            .any(|candidate| crate::core::tools::probe::paths_equal(&candidate.path, &requested))
    });

    if !known {
        return Err(AppError::validation(
            "that path is not one of the detected dependency locations",
        ));
    }

    if open_is_allowed_now() {
        tokio::task::spawn_blocking(move || {
            if let Err(error) = sys::reveal_path(&requested) {
                log::warn!("could not reveal the path: {error}");
            }
        });
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Webview cache
// ---------------------------------------------------------------------------

/// Where the platform's webview keeps its cache.
///
/// Each platform names it differently and puts it in a different one of
/// Tauri's directories, so the existing folder is preferred and the
/// conventional location is only the fallback.
fn webview_cache_dir(app: &AppHandle) -> Option<PathBuf> {
    let first_existing = |candidates: Vec<PathBuf>| -> Option<PathBuf> {
        candidates
            .iter()
            .find(|path| path.exists())
            .cloned()
            .or_else(|| candidates.into_iter().next())
    };

    #[cfg(target_os = "windows")]
    {
        first_existing(
            [
                app.path().app_local_data_dir().ok(),
                app.path().app_data_dir().ok(),
            ]
            .into_iter()
            .flatten()
            .map(|base| base.join("EBWebView"))
            .collect(),
        )
    }

    #[cfg(target_os = "linux")]
    {
        first_existing(
            app.path()
                .app_data_dir()
                .ok()
                .map(|base| vec![base.join("WebKitCache")])
                .unwrap_or_default(),
        )
    }

    #[cfg(target_os = "macos")]
    {
        first_existing(
            [
                app.path().app_cache_dir().ok(),
                app.path().app_data_dir().ok(),
            ]
            .into_iter()
            .flatten()
            .collect(),
        )
    }
}

#[tauri::command]
pub async fn get_webkit_cache_size_mb(app: AppHandle) -> AppResult<f64> {
    let Some(dir) = webview_cache_dir(&app) else {
        return Ok(0.0);
    };

    Ok(bytes_to_mb(dir_size_bytes(&dir).await))
}

#[tauri::command]
pub async fn clear_webkit_cache(app: AppHandle) -> AppResult<f64> {
    let dir = webview_cache_dir(&app)
        .ok_or_else(|| AppError::not_found("no webview cache directory on this platform"))?;

    let cleared = clear_dir_contents(&dir).await?;
    let mb = bytes_to_mb(cleared);
    log::info!("cleared {mb:.2} MB of webview cache");

    Ok(mb)
}
