//! The single error type that crosses the IPC boundary.
//!
//! Before this, twenty-six commands returned `Result<_, String>`. The frontend
//! could only tell one failure from another by matching on prose, which breaks
//! the moment a message is reworded. `AppError` serializes adjacently-tagged:
//!
//! ```json
//! { "kind": "verification", "message": "SHA-256 mismatch" }
//! ```
//!
//! so the frontend switches on `.kind` and uses `.message` only for display.
//! The mirror of this enum lives in `src/lib/types.ts` — change both together.
//!
//! ## Redaction
//!
//! Raw `io::Error` and subprocess output routinely contain absolute paths, and
//! on Windows an absolute path contains the account name. Every message built
//! here runs through [`redact`] first, which rewrites the home directory to
//! `~`. That keeps the message useful for debugging (the interesting part is
//! the tail of the path) without shipping the user's name to a log file or a
//! screenshot.

use std::path::Path;
use std::sync::OnceLock;

/// Every way a command can fail, as one closed set.
///
/// Variants are deliberately about *what the user can do next*, not about which
/// Rust library produced the error: `Network` and `Verification` mean different
/// things to a person looking at an install dialog, while two distinct
/// `reqwest` failures do not.
#[derive(Debug, thiserror::Error, serde::Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum AppError {
    /// Input from the webview was malformed or names something unknown.
    #[error("{0}")]
    Validation(String),

    /// A tool, path, or record that was expected to exist does not.
    #[error("{0}")]
    NotFound(String),

    /// Filesystem failure — reading, writing, creating, or removing.
    #[error("{0}")]
    Io(String),

    /// A spawned binary failed, timed out, or produced unusable output.
    #[error("{0}")]
    Subprocess(String),

    /// An HTTP request failed, or returned a non-success status.
    #[error("{0}")]
    Network(String),

    /// A download's SHA-256 did not match the manifest, or a freshly installed
    /// binary would not run. Never a transient failure — always suspicious.
    #[error("{0}")]
    Verification(String),

    /// An archive could not be opened or unpacked.
    #[error("{0}")]
    Extraction(String),

    /// This OS/architecture has no published build of the requested tool.
    #[error("unsupported platform")]
    UnsupportedPlatform,

    /// A background task panicked or was cancelled. Always a bug in this app,
    /// never something the user did.
    #[error("{0}")]
    Internal(String),
}

impl AppError {
    pub fn validation(message: impl AsRef<str>) -> Self {
        Self::Validation(redact(message.as_ref()))
    }

    pub fn not_found(message: impl AsRef<str>) -> Self {
        Self::NotFound(redact(message.as_ref()))
    }

    pub fn io(message: impl AsRef<str>) -> Self {
        Self::Io(redact(message.as_ref()))
    }

    pub fn subprocess(message: impl AsRef<str>) -> Self {
        Self::Subprocess(redact(message.as_ref()))
    }

    pub fn network(message: impl AsRef<str>) -> Self {
        Self::Network(redact(message.as_ref()))
    }

    pub fn verification(message: impl AsRef<str>) -> Self {
        Self::Verification(redact(message.as_ref()))
    }

    pub fn extraction(message: impl AsRef<str>) -> Self {
        Self::Extraction(redact(message.as_ref()))
    }

    pub fn internal(message: impl AsRef<str>) -> Self {
        Self::Internal(redact(message.as_ref()))
    }

    /// The tag the frontend switches on. Kept in one place so the TS union and
    /// the Rust enum can be diffed by eye.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Validation(_) => "validation",
            Self::NotFound(_) => "notFound",
            Self::Io(_) => "io",
            Self::Subprocess(_) => "subprocess",
            Self::Network(_) => "network",
            Self::Verification(_) => "verification",
            Self::Extraction(_) => "extraction",
            Self::UnsupportedPlatform => "unsupportedPlatform",
            Self::Internal(_) => "internal",
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::io(error.to_string())
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(error: tokio::task::JoinError) -> Self {
        Self::internal(error.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        Self::io(error.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(error: reqwest::Error) -> Self {
        Self::network(error.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/// The user's home directory, resolved once.
///
/// `OnceLock` rather than `.manage()` state because this genuinely is
/// compute-once-then-immutable — the distinction the vault draws between the
/// two, and the reason the caches in `state.rs` are *not* `OnceLock`.
fn home_dir() -> Option<&'static str> {
    static HOME: OnceLock<Option<String>> = OnceLock::new();

    HOME.get_or_init(|| {
        let raw = if cfg!(windows) {
            std::env::var("USERPROFILE").ok()
        } else {
            std::env::var("HOME").ok()
        };

        raw.map(|value| value.trim_end_matches(['/', '\\']).to_string())
            .filter(|value| !value.is_empty())
    })
    .as_deref()
}

/// Rewrite the home directory to `~` anywhere it appears in `message`.
///
/// Windows paths are matched case-insensitively (the filesystem is), and both
/// separators are tried, because a path that reached us through a subprocess's
/// stderr may use either.
pub fn redact(message: &str) -> String {
    let Some(home) = home_dir() else {
        return message.to_string();
    };

    let mut out = replace_prefix_form(message, home);

    if cfg!(windows) {
        let alternate = home.replace('\\', "/");
        if alternate != home {
            out = replace_prefix_form(&out, &alternate);
        }
    }

    out
}

/// Case-sensitivity here follows the platform, not the string: on Windows
/// `C:\Users\Ada` and `c:\users\ada` are the same directory, and a subprocess
/// is free to print either.
fn replace_prefix_form(haystack: &str, needle: &str) -> String {
    if needle.is_empty() {
        return haystack.to_string();
    }

    if !cfg!(windows) {
        return haystack.replace(needle, "~");
    }

    let lower_haystack = haystack.to_lowercase();
    let lower_needle = needle.to_lowercase();

    let mut out = String::with_capacity(haystack.len());
    let mut cursor = 0usize;

    while let Some(found) = lower_haystack[cursor..].find(&lower_needle) {
        let start = cursor + found;
        out.push_str(&haystack[cursor..start]);
        out.push('~');
        cursor = start + needle.len();
    }

    out.push_str(&haystack[cursor..]);
    out
}

/// A path rendered for a user-facing message: redacted, and lossy-converted so
/// a non-UTF-8 name cannot make an error disappear.
pub fn display_path(path: &Path) -> String {
    redact(&path.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_adjacently_tagged() {
        let json = serde_json::to_string(&AppError::Verification("bad hash".into())).unwrap();
        assert_eq!(json, r#"{"kind":"verification","message":"bad hash"}"#);
    }

    #[test]
    fn unit_variant_has_no_message_field() {
        let json = serde_json::to_string(&AppError::UnsupportedPlatform).unwrap();
        assert_eq!(json, r#"{"kind":"unsupportedPlatform"}"#);
    }

    #[test]
    fn kind_matches_the_serialized_tag() {
        // Guards the hand-written `kind()` against drift from the serde
        // rename_all, which is what the TS union is actually generated from.
        let cases: Vec<AppError> = vec![
            AppError::Validation(String::new()),
            AppError::NotFound(String::new()),
            AppError::Io(String::new()),
            AppError::Subprocess(String::new()),
            AppError::Network(String::new()),
            AppError::Verification(String::new()),
            AppError::Extraction(String::new()),
            AppError::UnsupportedPlatform,
            AppError::Internal(String::new()),
        ];

        for case in cases {
            let value = serde_json::to_value(&case).unwrap();
            assert_eq!(value["kind"], case.kind(), "tag drifted for {case:?}");
        }
    }

    #[test]
    fn replace_prefix_form_handles_repeats_and_tail() {
        let out = replace_prefix_form("a /home/x b /home/x c", "/home/x");
        assert_eq!(out, "a ~ b ~ c");
    }

    #[test]
    fn replace_prefix_form_is_a_no_op_without_a_match() {
        assert_eq!(
            replace_prefix_form("nothing here", "/home/x"),
            "nothing here"
        );
    }

    #[test]
    fn redact_without_a_home_dir_is_lossless() {
        // Whatever HOME is on the test machine, a message that cannot contain
        // it must survive untouched — redaction should never mangle content.
        assert_eq!(
            redact("plain message with no path"),
            "plain message with no path"
        );
    }
}
