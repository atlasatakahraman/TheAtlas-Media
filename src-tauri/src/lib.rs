use std::env;

mod commands;

use std::sync::OnceLock;

static DISPLAY_SERVER: OnceLock<DisplayServer> = OnceLock::new();
#[allow(dead_code)]
static COMPOSITING_DISABLED: OnceLock<bool> = OnceLock::new();

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DisplayServer {
    Wayland,
    X11,
    Other,
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .setup(|_app| {
            DISPLAY_SERVER.get_or_init(detect_display_server);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_display_server,
            set_window_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
