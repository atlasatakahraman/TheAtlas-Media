//! The shapes that cross IPC for the dependency system.
//!
//! Mirrored by hand in `src/lib/types.ts` — there is no codegen, so a change
//! here is only half a change. Every struct is `rename_all = "camelCase"`, and
//! `Option<T>` becomes `T | null` on the other side.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DependencyStatus {
    Installed,
    NotInstalled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DependencySource {
    Env,
    Managed,
    Path,
    /// A path the user manually selected via the "Change Path" picker.
    /// Always takes priority over every auto-detected candidate.
    Custom,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyInfo {
    pub name: String,
    pub status: DependencyStatus,
    pub source: DependencySource,
    pub path: Option<String>,
    pub version: Option<String>,
    pub latest_version: Option<String>,
    pub size_mb: Option<f64>,
    /// Exact on-disk byte size of the resolved binary. Preferred over
    /// `size_mb` for display — the UI formats it in binary units (KiB/MiB/GiB)
    /// so sub-megabyte binaries (e.g. `yt-dlp.exe`) don't collapse to "0.1 MB".
    pub size_bytes: Option<u64>,
    pub sha256: Option<String>,
    pub error: Option<String>,
    /// Whether a working managed copy exists in the app's managed bin dir,
    /// independent of which source is currently active.
    pub managed_installed: bool,
    /// Version string of the managed copy, if one exists.
    pub managed_version: Option<String>,
    /// Path of the managed copy, if one exists.
    pub managed_path: Option<String>,
    /// Authoritative "an update is available" flag. Only ever true when
    /// `source == Managed` — external installs are never claimed stale.
    pub update_available: bool,
}

impl DependencyInfo {
    /// A not-installed record with an explanation. Every "missing" path in the
    /// resolver builds its result through here so the fifteen fields stay in
    /// agreement — three hand-written copies of this literal had already
    /// started to drift.
    pub fn missing(name: &str, error: impl Into<String>) -> Self {
        Self {
            name: name.to_string(),
            status: DependencyStatus::NotInstalled,
            source: DependencySource::Missing,
            path: None,
            version: None,
            latest_version: None,
            size_mb: None,
            size_bytes: None,
            sha256: None,
            error: Some(error.into()),
            managed_installed: false,
            managed_version: None,
            managed_path: None,
            update_available: false,
        }
    }
}

/// The full report the dependencies page renders.
///
/// Still three named fields rather than a map: the frontend's `DependencyReport`
/// type, the header badge and the storage banner all read them by name, and a
/// map would trade a compile error for a runtime `undefined` on the day a key
/// is renamed. A fourth tool adds a field here and in `types.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyReport {
    pub ffmpeg: DependencyInfo,
    pub ffprobe: DependencyInfo,
    pub ytdlp: DependencyInfo,
    pub all_installed: bool,
}

/// One auto-detected path option surfaced by the "Change Path" picker.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyCandidate {
    pub source: DependencySource,
    pub path: String,
    pub version: Option<String>,
    pub working: bool,
    /// On-disk byte size of this candidate binary, when it could be stat'd.
    pub size_bytes: Option<u64>,
}

/// An entry in the resolution order, before it has been probed.
#[derive(Debug, Clone)]
pub struct CandidatePath {
    pub path: PathBuf,
    pub source: DependencySource,
}

/// Per-tool manual path overrides, persisted to `dependency_prefs.json`.
///
/// Keyed by `ToolSpec::key` rather than the three named fields it used to
/// have, so a new tool needs no struct change. The flattened map serializes to
/// exactly the old file's shape (`{"ffmpeg": "...", "ytdlp": null}`), so
/// existing installs keep their picked paths across this refactor.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DependencyPrefs {
    pub paths: BTreeMap<String, Option<String>>,
}

impl DependencyPrefs {
    pub fn path_for(&self, key: &str) -> Option<&str> {
        self.paths
            .get(key)
            .and_then(|value| value.as_deref())
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }

    pub fn set_path_for(&mut self, key: &str, path: Option<String>) {
        match path {
            Some(value) => {
                self.paths.insert(key.to_string(), Some(value));
            }
            // Written as an explicit null rather than dropped, so the file
            // still shows which tools the picker knows about.
            None => {
                self.paths.insert(key.to_string(), None);
            }
        }
    }
}

/// Everything the resolver needs that it cannot work out for itself.
///
/// Passed in rather than read from an `AppHandle`, which is what lets every
/// function in `probe.rs` be tested against a temp directory with no Tauri
/// runtime present.
#[derive(Debug, Clone)]
pub struct ResolveCtx {
    pub managed_bin_dir: PathBuf,
    pub prefs: DependencyPrefs,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefs_round_trip_through_the_legacy_file_shape() {
        let legacy = r#"{"ffmpeg":"C:\\tools\\ffmpeg.exe","ffprobe":null,"ytdlp":null}"#;
        let prefs: DependencyPrefs = serde_json::from_str(legacy).unwrap();

        assert_eq!(prefs.path_for("ffmpeg"), Some("C:\\tools\\ffmpeg.exe"));
        assert_eq!(prefs.path_for("ffprobe"), None);

        let written = serde_json::to_string(&prefs).unwrap();
        assert!(written.contains("\"ffprobe\":null"));
    }

    #[test]
    fn blank_override_reads_as_unset() {
        let prefs: DependencyPrefs = serde_json::from_str(r#"{"ffmpeg":"   "}"#).unwrap();
        assert_eq!(prefs.path_for("ffmpeg"), None);
    }

    #[test]
    fn clearing_an_override_keeps_the_key_visible() {
        let mut prefs = DependencyPrefs::default();
        prefs.set_path_for("ytdlp", Some("/usr/bin/yt-dlp".into()));
        prefs.set_path_for("ytdlp", None);

        assert_eq!(prefs.path_for("ytdlp"), None);
        assert!(prefs.paths.contains_key("ytdlp"));
    }
}
