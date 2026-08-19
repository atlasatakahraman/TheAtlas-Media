//! Long-lived application state, and the one place `core/` meets Tauri.
//!
//! Registered once in `lib.rs` as `.manage(Arc<AppState>)` and reached from a
//! command through `tauri::State<'_, Arc<AppState>>`.
//!
//! ## Why one struct and not four `.manage()` calls
//!
//! `Rust-Tauri/06` prefers several small `.manage(Arc<Thing>)` registrations
//! over one big struct, and gives the reason: a single outer mutex over
//! unrelated fields creates false contention. That reason does not apply here
//! — `AppState` has no outer lock at all. Each field owns its own locking
//! (`ProbeCache` an inner `std::sync::Mutex` per cache, `KvStore` a
//! `tokio::sync::Mutex` over its namespaces) and `reqwest::Client` is already
//! internally shared and cheap to clone. So the fields are as independent as
//! four separate registrations would make them, and commands get one lookup
//! instead of four.
//!
//! ## Why not `OnceLock`
//!
//! The vault reserves `OnceLock` for compute-once-then-immutable. `DISPLAY_SERVER`
//! and `OPERATING_SYSTEM` in `lib.rs` are exactly that and stay as they are.
//! The caches here are neither — they are mutated for the life of the process,
//! and a global `OnceLock<Mutex<…>>` for them (which is what this code used to
//! do) makes them unreachable from a test and impossible to reset between two.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::core::media::engine::MediaEngine;
use crate::core::store::kv::KvStore;
use crate::core::tools::probe::{platform_dir_name, ProbeCache};
use crate::core::tools::types::{DependencyPrefs, ResolveCtx};
use crate::core::tools::verify::ArtifactJournal;
use crate::error::{AppError, AppResult};

/// Sent to every upstream this app talks to. Version-stamped so a rate-limit
/// or an abuse report can be traced to a release.
const USER_AGENT: &str = concat!("TheAtlas-Media/", env!("CARGO_PKG_VERSION"));

/// Every path the app writes to, resolved once at startup.
///
/// Resolving these eagerly turns a `Result` that had to be handled at a dozen
/// call sites into one that is handled during `setup`, where failing loudly is
/// the correct response anyway: an app that cannot find its own data directory
/// has nothing useful to do.
#[derive(Debug, Clone)]
pub struct AppPaths {
    pub local_data: PathBuf,
    /// Managed binaries, under an OS/arch sub-directory so a copied or synced
    /// app-data folder cannot offer a Linux binary to a Windows install.
    pub managed_bin: PathBuf,
    /// Root of the KV store's namespace files.
    pub kv_root: PathBuf,
    pub dependency_prefs: PathBuf,
    pub update_cache: PathBuf,
    pub artifact_journal: PathBuf,
    pub media_history: PathBuf,
}

impl AppPaths {
    pub fn resolve(app: &AppHandle) -> AppResult<Self> {
        let local_data = app
            .path()
            .app_local_data_dir()
            .map_err(|error| AppError::io(format!("no app data directory: {error}")))?;

        Ok(Self {
            managed_bin: local_data.join("bin").join(platform_dir_name()),
            kv_root: local_data.join("prefs"),
            dependency_prefs: local_data.join("dependency_prefs.json"),
            update_cache: local_data.join("update_cache.json"),
            artifact_journal: local_data.join("installed_artifacts.json"),
            media_history: local_data.join("media_history.json"),
            local_data,
        })
    }
}

pub struct AppState {
    pub paths: AppPaths,
    pub probe: Arc<ProbeCache>,
    pub kv: Arc<KvStore>,
    /// One client for the process. Building one per request throws away
    /// connection pooling and repeats the TLS handshake every time.
    pub http: reqwest::Client,
    pub media: Arc<MediaEngine>,
}

impl AppState {
    pub fn new(paths: AppPaths) -> AppResult<Self> {
        let kv = Arc::new(KvStore::new(paths.kv_root.clone()));

        Ok(Self {
            probe: Arc::new(ProbeCache::new()),
            http: crate::core::tools::download::build_client(USER_AGENT)?,
            kv,
            media: Arc::new(MediaEngine::new()),
            paths,
        })
    }

    /// Load the resolution context: managed dir plus the user's picked paths.
    ///
    /// Read fresh on each call rather than cached — the prefs file is a few
    /// hundred bytes, and a stale override is the kind of bug where the UI
    /// says one path and the app runs another.
    pub async fn resolve_ctx(&self) -> ResolveCtx {
        ResolveCtx {
            managed_bin_dir: self.paths.managed_bin.clone(),
            prefs: read_json_or_default(&self.paths.dependency_prefs).await,
        }
    }

    pub async fn save_dependency_prefs(&self, prefs: &DependencyPrefs) -> AppResult<()> {
        write_json(&self.paths.dependency_prefs, prefs).await
    }

    pub async fn artifact_journal(&self) -> ArtifactJournal {
        read_json_or_default(&self.paths.artifact_journal).await
    }

    pub async fn save_artifact_journal(&self, journal: &ArtifactJournal) -> AppResult<()> {
        write_json(&self.paths.artifact_journal, journal).await
    }
}

/// Read a JSON file, falling back to the type's default.
///
/// A missing file is the normal first-run case, and a corrupt one should cost
/// the user that file's contents rather than the ability to launch. Anything
/// that genuinely must not be silently defaulted does not belong here.
pub async fn read_json_or_default<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    let Ok(bytes) = tokio::fs::read(path).await else {
        return T::default();
    };

    serde_json::from_slice(&bytes).unwrap_or_else(|error| {
        log::warn!(
            "{} is not valid JSON, using defaults: {error}",
            path.display()
        );
        T::default()
    })
}

pub async fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let body = serde_json::to_vec_pretty(value)?;
    tokio::fs::write(path, body).await?;
    Ok(())
}

/// Shorthand for the state lookup every command opens with.
pub type State<'a> = tauri::State<'a, Arc<AppState>>;
