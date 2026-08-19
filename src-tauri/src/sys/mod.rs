//! Platform integration that needs `unsafe`, isolated in one place.
//!
//! The crate root sets `#![deny(unsafe_code)]`. This module is the single
//! `#[allow]` exception, so "where is the unsafe code?" has a one-word answer.
//! `deny` rather than `forbid` precisely because of this file — `forbid`
//! cannot be lifted locally, and the alternative is losing the feature below.
//!
//! What needs it: opening a folder in *the user's chosen* file manager on
//! Windows. `ShellExecuteW` with a NULL verb honours whatever the user has set
//! as the handler for a directory; every safe wrapper available here hardcodes
//! Explorer, so someone running File Pilot or Directory Opus would have their
//! choice quietly ignored. On every other platform the safe plugin call does
//! the right thing and there is no `unsafe` at all.

use std::path::Path;

use crate::error::{AppError, AppResult};

/// Open a directory in the OS file manager.
pub fn open_directory(path: &Path) -> AppResult<()> {
    #[cfg(windows)]
    {
        windows_shell_execute(path)
    }

    #[cfg(not(windows))]
    {
        tauri_plugin_opener::open_path(path, None::<&str>)
            .map_err(|error| AppError::io(error.to_string()))
    }
}

/// Reveal a file by opening the directory that contains it.
pub fn reveal_path(path: &Path) -> AppResult<()> {
    #[cfg(windows)]
    {
        // Explorer's `/select,` argument would highlight the file, but it also
        // forces Explorer specifically. Opening the parent keeps the user's
        // own file manager, which is the whole reason this code exists.
        let folder = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        windows_shell_execute(folder)
    }

    #[cfg(not(windows))]
    {
        tauri_plugin_opener::reveal_item_in_dir(path)
            .map_err(|error| AppError::io(error.to_string()))
    }
}

#[cfg(windows)]
#[allow(unsafe_code)]
fn windows_shell_execute(path: &Path) -> AppResult<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: isize,
            lp_operation: *const u16,
            lp_file: *const u16,
            lp_parameters: *const u16,
            lp_directory: *const u16,
            n_show_cmd: i32,
        ) -> isize;
    }

    /// `SW_SHOWNORMAL`.
    const SHOW_NORMAL: i32 = 1;
    /// `ShellExecuteW` returns a fake HINSTANCE; anything above 32 is success.
    const SUCCESS_THRESHOLD: isize = 32;

    // Owned for the whole call, and NUL-terminated — `ShellExecuteW` reads
    // until the NUL, and a borrowed temporary would be freed underneath it.
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();

    // SAFETY: `wide` is a NUL-terminated UTF-16 buffer that outlives the call.
    // The four null pointers are documented as optional parameters, and a NULL
    // verb selects the user's configured default action for the target.
    let result = unsafe {
        ShellExecuteW(
            0,
            std::ptr::null(),
            wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SHOW_NORMAL,
        )
    };

    if result > SUCCESS_THRESHOLD {
        Ok(())
    } else {
        Err(AppError::io(format!(
            "the file manager could not be opened (ShellExecute code {result})"
        )))
    }
}
