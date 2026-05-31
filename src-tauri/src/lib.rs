use std::env;
use tauri::Manager;

mod commands;

#[tauri::command]
fn is_wayland() -> bool {
    std::env::var("WAYLAND_DISPLAY").is_ok()
        || std::env::var("XDG_SESSION_TYPE")
            .unwrap_or_default()
            .to_lowercase()
            == "wayland"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        let is_wayland = env::var("XDG_SESSION_TYPE")
            .map(|val| val == "wayland")
            .unwrap_or(false);

        if is_wayland {
            env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![is_wayland])
        .setup(|app| {
            let _webview = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "windows")]
            {
                _webview.set_shadow(false);
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
