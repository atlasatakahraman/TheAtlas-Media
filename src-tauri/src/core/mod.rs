//! Business logic, framework-agnostic and unit-testable.
//!
//! Nothing in here imports `tauri`. Everything a Tauri runtime would normally
//! supply — the app data directory, an HTTP client, a progress sink — arrives
//! as a plain argument, which is what makes these modules testable against a
//! temp directory instead of a running desktop app.
//!
//! The thin `#[tauri::command]` adapters that call into this live in
//! `commands/`. Per `Rust-Tauri/06`, that split also keeps the IPC-facing
//! surface small enough to read in one sitting.

pub mod media;
pub mod store;
pub mod tools;
