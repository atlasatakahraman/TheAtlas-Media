//! IPC adapters. Every `#[tauri::command]` in the app lives under here.
//!
//! The rule these follow, from `Rust-Tauri/06`: deserialize, validate, call
//! `core::`, serialize. A command with a decision in it is a command with an
//! untested decision in it, because testing one needs a Tauri runtime.
//!
//! `unwrap_used` is denied for the whole module tree. A panic in a command
//! unwinds only that task, but it reaches the frontend as an opaque rejected
//! promise instead of a typed `AppError` — and a malformed IPC payload should
//! never be able to produce one.
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

pub mod dependency;
pub mod install;
pub mod media;
pub mod prefs;
pub mod storage;
pub mod update;
