mod commands;
mod error;
mod supabase;

use crate::supabase::SupabaseClient;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");

    let supabase_client = SupabaseClient::new();

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_oauth::init())
        .manage(supabase_client)
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_oauth_start,
            commands::auth::auth_oauth_cancel,
            commands::auth::auth_parse_oauth_callback,
            commands::auth::auth_sign_out,
            commands::auth::auth_get_session,
            commands::auth::auth_refresh_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
