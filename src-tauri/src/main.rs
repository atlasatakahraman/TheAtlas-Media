// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    disable_wayland_compositing_if_needed();

    app_lib::run();
}

#[cfg(target_os = "linux")]
fn disable_wayland_compositing_if_needed() {
    let on_wayland = std::env::var("WAYLAND_DISPLAY").is_ok_and(|v| !v.is_empty());
    if !on_wayland {
        return;
    }

    if std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_ok() {
        return;
    }

    unsafe {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
}
