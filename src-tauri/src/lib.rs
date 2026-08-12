pub mod commands;

use std::env::consts::OS;
use std::sync::OnceLock;

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

#[tauri::command]
async fn set_window_position(window: tauri::WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if matches!(
        DISPLAY_SERVER.get_or_init(detect_display_server),
        DisplayServer::Wayland
    ) {
        return Ok(());
    }

    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Force disable OpenGL explicit sync on NVIDIA cards (prevents compositor deadlock
    // when startViewTransition is used under Wayland on Linux)
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            DISPLAY_SERVER.get_or_init(detect_display_server);
            OPERATING_SYSTEM.get_or_init(detect_operating_system);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = commands::update::run_update_check(&handle, false).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_display_server,
            set_window_position,
            get_operating_system,
            commands::dependency::check_installed_dependencies,
            commands::dependency::check_dependencies,
            commands::dependency::get_app_storage_size_mb,
            commands::dependency::get_webkit_cache_size_mb,
            commands::dependency::clear_webkit_cache,
            commands::install::install_dependency,
            commands::install::install_all_missing,
            commands::install::uninstall_dependency,
            commands::install::get_download_size_mb,
            commands::install::get_all_download_sizes_mb,
            commands::update::check_for_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
