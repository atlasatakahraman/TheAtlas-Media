//! Application entry point: builder setup, state registration, and the
//! authoritative list of IPC commands.
//!
//! `deny` rather than `forbid` for `unsafe_code` because `sys/` needs exactly
//! one documented exception and `forbid` cannot be lifted locally. Everything
//! else in the crate is safe Rust, and the lint says so at build time rather
//! than by convention.
#![deny(unsafe_code)]

pub mod commands;
pub mod core;
pub mod error;
pub mod state;
pub mod sys;

use std::env::consts::OS;
use std::sync::{Arc, OnceLock};

use tauri::Manager;

use crate::error::AppResult;
use crate::state::{AppPaths, AppState};

// Detected once and never changed afterwards, which is what `OnceLock` is for.
// The mutable state — probe caches, the KV store — lives in `AppState` behind
// `.manage()` instead; see the note at the top of `state.rs`.
static DISPLAY_SERVER: OnceLock<DisplayServer> = OnceLock::new();
#[allow(dead_code)]
static COMPOSITING_DISABLED: OnceLock<bool> = OnceLock::new();
static OPERATING_SYSTEM: OnceLock<OperatingSystem> = OnceLock::new();

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DisplayServer {
    Wayland,
    X11,
    Other,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OperatingSystem {
    Windows,
    Linux,
    MacOS,
    Other,
}

fn detect_operating_system() -> OperatingSystem {
    if OS.contains("linux") {
        OperatingSystem::Linux
    } else if OS.contains("windows") {
        OperatingSystem::Windows
    } else if OS.contains("macos") {
        OperatingSystem::MacOS
    } else {
        OperatingSystem::Other
    }
}

fn detect_display_server() -> DisplayServer {
    #[cfg(target_os = "linux")]
    {
        if std::env::var("WAYLAND_DISPLAY").is_ok_and(|v| !v.is_empty())
            || std::env::var("XDG_SESSION_TYPE")
                .unwrap_or_default()
                .to_lowercase()
                == "wayland"
        {
            COMPOSITING_DISABLED.get_or_init(|| {
                std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_ok_and(|v| v == "1")
            });
            DisplayServer::Wayland
        } else {
            DisplayServer::Other
        }
    }

    #[cfg(not(target_os = "linux"))]
    DisplayServer::Other
}

#[tauri::command]
fn get_operating_system() -> OperatingSystem {
    OPERATING_SYSTEM
        .get_or_init(detect_operating_system)
        .clone()
}

#[tauri::command]
fn get_display_server() -> DisplayServer {
    DISPLAY_SERVER.get_or_init(detect_display_server).clone()
}

/// Move the window. A no-op under Wayland, which does not let a client place
/// its own surface — see the Linux notes in CLAUDE.md.
#[tauri::command]
async fn set_window_position(window: tauri::WebviewWindow, x: i32, y: i32) -> AppResult<()> {
    #[cfg(target_os = "linux")]
    if matches!(
        DISPLAY_SERVER.get_or_init(detect_display_server),
        DisplayServer::Wayland
    ) {
        return Ok(());
    }

    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
        .map_err(|error| crate::error::AppError::internal(error.to_string()))
}

#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Force-disable OpenGL explicit sync on NVIDIA cards; without it a
    // `startViewTransition` under Wayland deadlocks the compositor.
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            DISPLAY_SERVER.get_or_init(detect_display_server);
            OPERATING_SYSTEM.get_or_init(detect_operating_system);

            let handle = app.handle().clone();

            // Failing here is correct and loud: an app that cannot find its
            // own data directory or build an HTTP client has nothing to offer,
            // and a half-initialised one would fail later in ways that read as
            // unrelated bugs.
            let paths = AppPaths::resolve(&handle)?;
            let state = Arc::new(AppState::new(paths)?);
            app.manage(Arc::clone(&state));

            // The KV store's debounced writer. One task for the process; it
            // sleeps on a `Notify` and costs nothing while the app is idle.
            tauri::async_runtime::spawn(Arc::clone(&state.kv).run_flush_loop());

            // The persisted concurrency preference, applied once at startup —
            // `MediaEngine::new()` otherwise stays at its default of 2.
            tauri::async_runtime::spawn({
                let state = Arc::clone(&state);
                async move {
                    if let Ok(Some(value)) = state.kv.get("media", "concurrency").await {
                        if let Some(limit) = value.as_u64() {
                            state.media.set_limit(limit as usize);
                        }
                    }
                }
            });

            commands::update::spawn_startup_check(&handle);

            Ok(())
        })
        .on_window_event(|window, event| {
            // A pending debounced write must not die with the window. This is
            // the only place a preference set in the last few hundred
            // milliseconds before a quit gets to reach the disk.
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.app_handle().try_state::<Arc<AppState>>() {
                    let kv = Arc::clone(&state.kv);
                    tauri::async_runtime::block_on(async move {
                        if let Err(error) = kv.flush_all().await {
                            log::warn!("could not flush preferences on exit: {error}");
                        }
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Shell
            get_display_server,
            get_operating_system,
            set_window_position,
            open_devtools,
            // Dependency detection
            commands::dependency::check_dependencies,
            commands::dependency::check_installed_dependencies,
            commands::dependency::check_dependency_paths,
            commands::dependency::get_dependency_candidates,
            commands::dependency::set_dependency_override,
            commands::dependency::set_all_dependency_overrides,
            // Install lifecycle
            commands::install::install_dependency,
            commands::install::install_tools,
            commands::install::install_all_missing,
            commands::install::uninstall_dependency,
            commands::install::get_download_size_mb,
            commands::update::check_for_updates,
            // Storage
            commands::storage::get_app_storage_path,
            commands::storage::get_app_storage_size_mb,
            commands::storage::open_app_storage_dir,
            commands::storage::reveal_dependency_path,
            commands::storage::get_webkit_cache_size_mb,
            commands::storage::clear_webkit_cache,
            // Preferences
            commands::prefs::kv_get,
            commands::prefs::kv_entries,
            commands::prefs::kv_set,
            commands::prefs::kv_patch,
            commands::prefs::kv_delete,
            // Media
            commands::media::probe_media_url,
            commands::media::probe_media_file,
            commands::media::enqueue_download,
            commands::media::enqueue_convert,
            commands::media::cancel_media_job,
            commands::media::list_media_jobs,
            commands::media::get_media_history,
            commands::media::clear_media_history,
            commands::media::set_media_concurrency,
            commands::media::get_default_media_output_dir,
            commands::media::reveal_output_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
