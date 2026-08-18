use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tokio::{process::Command, time::timeout};

type CachedFileMetadata = (u64, std::time::SystemTime, String);
type PathMetadataMap = std::collections::HashMap<PathBuf, CachedFileMetadata>;

static SHA256_CACHE: std::sync::OnceLock<std::sync::Mutex<PathMetadataMap>> =
    std::sync::OnceLock::new();

fn sha256_cache() -> &'static std::sync::Mutex<PathMetadataMap> {
    SHA256_CACHE.get_or_init(Default::default)
}

static VERSION_CACHE: std::sync::OnceLock<std::sync::Mutex<PathMetadataMap>> =
    std::sync::OnceLock::new();

fn version_cache() -> &'static std::sync::Mutex<PathMetadataMap> {
    VERSION_CACHE.get_or_init(Default::default)
}

pub(crate) async fn compute_file_sha256(path: &Path) -> Result<String, String> {
    let path_buf = path.to_path_buf();
    let metadata = tokio::fs::metadata(&path_buf)
        .await
        .map_err(|e| e.to_string())?;
    let len = metadata.len();
    let mtime = metadata.modified().map_err(|e| e.to_string())?;

    if let Ok(cache) = sha256_cache().lock() {
        if let Some((cached_len, cached_mtime, cached_hash)) = cache.get(&path_buf) {
            if *cached_len == len && *cached_mtime == mtime {
                return Ok(cached_hash.clone());
            }
        }
    }

    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let mut file = std::fs::File::open(&path_buf).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 65536];
        use std::io::Read;

        loop {
            let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }

        let hash = format!("{:x}", hasher.finalize());

        if let Ok(mut cache) = sha256_cache().lock() {
            cache.insert(path_buf, (len, mtime, hash.clone()));
        }

        Ok(hash)
    })
    .await
    .map_err(|e| e.to_string())?
}

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

#[derive(Debug, Clone)]
pub struct DependencyPaths {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub ytdlp: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyReport {
    pub ffmpeg: DependencyInfo,
    pub ffprobe: DependencyInfo,
    pub ytdlp: DependencyInfo,
    pub all_installed: bool,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Tool {
    FFmpeg,
    FFprobe,
    YTdlp,
}

impl Tool {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Tool::FFmpeg => "ffmpeg",
            Tool::FFprobe => "ffprobe",
            Tool::YTdlp => "yt-dlp",
        }
    }

    fn env_var(self) -> &'static str {
        match self {
            Tool::FFmpeg => "THEATLAS_FFMPEG_PATH",
            Tool::FFprobe => "THEATLAS_FFPROBE_PATH",
            Tool::YTdlp => "THEATLAS_YTDLP_PATH",
        }
    }

    pub(crate) fn exe_name(self) -> &'static str {
        match self {
            Tool::FFmpeg => {
                if cfg!(windows) {
                    "ffmpeg.exe"
                } else {
                    "ffmpeg"
                }
            }
            Tool::FFprobe => {
                if cfg!(windows) {
                    "ffprobe.exe"
                } else {
                    "ffprobe"
                }
            }
            Tool::YTdlp => {
                if cfg!(windows) {
                    "yt-dlp.exe"
                } else {
                    "yt-dlp"
                }
            }
        }
    }

    fn version_args(self) -> &'static [&'static str] {
        match self {
            Tool::FFmpeg => &["-version"],
            Tool::FFprobe => &["-version"],
            Tool::YTdlp => &["--version"],
        }
    }
}

/// Maps an IPC `name` string to a `Tool`. Distinct from `install::name_to_target`,
/// which is coarser (ffmpeg and ffprobe share one download bundle there) — path
/// overrides are per-binary, so ffmpeg and ffprobe need to resolve separately here.
fn tool_from_name(name: &str) -> Result<Tool, String> {
    match name {
        "ffmpeg" => Ok(Tool::FFmpeg),
        "ffprobe" => Ok(Tool::FFprobe),
        "yt-dlp" | "ytdlp" => Ok(Tool::YTdlp),
        other => Err(format!("unknown dependency: {other}")),
    }
}

// ---------------------------------------------------------------------------
// User-selected path overrides ("Change Path" picker)
// ---------------------------------------------------------------------------

/// Per-tool manual path override, persisted to `dependency_prefs.json` in the
/// app's local data dir. When set for a tool, it outranks every auto-detected
/// candidate (including an active env-var override) in `candidate_paths`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DependencyPrefs {
    pub ffmpeg: Option<String>,
    pub ffprobe: Option<String>,
    pub ytdlp: Option<String>,
}

impl DependencyPrefs {
    fn path_for(&self, tool: Tool) -> Option<String> {
        match tool {
            Tool::FFmpeg => self.ffmpeg.clone(),
            Tool::FFprobe => self.ffprobe.clone(),
            Tool::YTdlp => self.ytdlp.clone(),
        }
    }

    fn set_path_for(&mut self, tool: Tool, path: Option<String>) {
        match tool {
            Tool::FFmpeg => self.ffmpeg = path,
            Tool::FFprobe => self.ffprobe = path,
            Tool::YTdlp => self.ytdlp = path,
        }
    }
}

fn dependency_prefs_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("dependency_prefs.json"))
}

async fn load_dependency_prefs(app: &AppHandle) -> DependencyPrefs {
    let Ok(path) = dependency_prefs_path(app) else {
        return DependencyPrefs::default();
    };
    let Ok(content) = tokio::fs::read_to_string(&path).await else {
        return DependencyPrefs::default();
    };
    serde_json::from_str(&content).unwrap_or_default()
}

async fn save_dependency_prefs(app: &AppHandle, prefs: &DependencyPrefs) -> Result<(), String> {
    let path = dependency_prefs_path(app)?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| e.to_string())
}

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

/// Process-wide cache of probed candidates, keyed by tool name. Probing is
/// expensive — every candidate spawns the binary to read its version, and a
/// long `PATH` can hold several — which made opening the "Change Path" dialog
/// take seconds. The cache is explicitly invalidated by every action that can
/// change what's on disk or which path wins (install, uninstall, update,
/// override change), so it never goes stale behind the user's back.
static CANDIDATE_CACHE: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<&'static str, Vec<DependencyCandidate>>>,
> = std::sync::OnceLock::new();

fn candidate_cache(
) -> &'static std::sync::Mutex<std::collections::HashMap<&'static str, Vec<DependencyCandidate>>> {
    CANDIDATE_CACHE.get_or_init(Default::default)
}

/// Drop every cached candidate list, version cache, and sha256 cache. Call after any
/// action that installs, uninstalls, updates, or re-points a dependency.
pub(crate) fn invalidate_candidate_cache() {
    if let Ok(mut cache) = candidate_cache().lock() {
        cache.clear();
    }
    if let Ok(mut cache) = sha256_cache().lock() {
        cache.clear();
    }
    if let Ok(mut cache) = version_cache().lock() {
        cache.clear();
    }
}

fn cached_candidates(tool: Tool) -> Option<Vec<DependencyCandidate>> {
    candidate_cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(tool.name()).cloned())
}

fn store_candidates(tool: Tool, candidates: &[DependencyCandidate]) {
    if let Ok(mut cache) = candidate_cache().lock() {
        cache.insert(tool.name(), candidates.to_vec());
    }
}

/// Probe every existing, de-duplicated candidate path concurrently. Each probe
/// runs `--version` (up to an 8s timeout) plus a `stat`, so doing them
/// sequentially made the total the *sum* of every candidate; spawned onto the
/// runtime it is the slowest single probe instead.
async fn probe_candidates(app: &AppHandle, tool: Tool) -> Vec<DependencyCandidate> {
    let mut seen = std::collections::HashSet::new();
    let mut unique = Vec::new();

    for candidate in base_candidate_paths(app, tool) {
        if !candidate.path.exists() {
            continue;
        }
        let path_str = candidate.path.to_string_lossy().to_string();
        if !seen.insert(path_str.clone()) {
            continue; // e.g. the managed dir also happens to be on PATH
        }
        unique.push((candidate, path_str));
    }

    let handles: Vec<_> = unique
        .into_iter()
        .map(|(candidate, path_str)| {
            tokio::spawn(async move {
                let version = read_version(&candidate.path, tool).await.ok();
                let size_bytes = tokio::fs::metadata(&candidate.path)
                    .await
                    .map(|m| m.len())
                    .ok();

                DependencyCandidate {
                    source: candidate.source,
                    path: path_str,
                    working: version.is_some(),
                    version,
                    size_bytes,
                }
            })
        })
        .collect();

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        if let Ok(candidate) = handle.await {
            results.push(candidate);
        }
    }

    results
}

/// List every auto-detected candidate for `name` (env override, managed,
/// PATH scan), each version-checked, for the "Change Path" picker UI. Does
/// NOT include the current manual override itself — the frontend compares
/// each entry's `path` against the live `DependencyInfo.path` to mark the
/// active one.
///
/// Served from `CANDIDATE_CACHE` when warm. Pass `refresh: true` to force a
/// re-probe (the frontend does this after install/uninstall/path changes).
#[tauri::command]
pub async fn get_dependency_candidates(
    app: AppHandle,
    name: String,
    refresh: Option<bool>,
) -> Result<Vec<DependencyCandidate>, String> {
    let tool = tool_from_name(&name)?;

    if !refresh.unwrap_or(false) {
        if let Some(cached) = cached_candidates(tool) {
            return Ok(cached);
        }
    }

    let results = probe_candidates(&app, tool).await;
    store_candidates(tool, &results);

    Ok(results)
}

/// Set (or, with `path: None`, clear) the manual path override for `name`.
/// A non-empty path is validated — it must exist and run successfully as
/// this tool — before being persisted, so the picker can't save a dead link.
#[tauri::command]
pub async fn set_dependency_override(
    app: AppHandle,
    name: String,
    path: Option<String>,
) -> Result<DependencyInfo, String> {
    let tool = tool_from_name(&name)?;

    let normalized = match path {
        Some(p) if !p.trim().is_empty() => {
            let trimmed = p.trim().to_string();
            let pb = PathBuf::from(&trimmed);
            if !pb.exists() {
                return Err(format!("{trimmed} does not exist"));
            }
            read_version(&pb, tool)
                .await
                .map_err(|e| format!("Selected file is not a valid {}: {e}", tool.name()))?;
            Some(trimmed)
        }
        _ => None,
    };

    let mut prefs = load_dependency_prefs(&app).await;
    prefs.set_path_for(tool, normalized);
    save_dependency_prefs(&app, &prefs).await?;
    invalidate_candidate_cache();

    Ok(check_tool(&app, tool).await)
}

#[tauri::command]
pub async fn check_installed_dependencies(app: AppHandle) -> Result<DependencyStatus, String> {
    let report = check_dependencies(app).await?;

    if report.all_installed {
        Ok(DependencyStatus::Installed)
    } else {
        Ok(DependencyStatus::NotInstalled)
    }
}

#[tauri::command]
pub async fn check_dependencies(app: AppHandle) -> Result<DependencyReport, String> {
    let app_ff = app.clone();
    let app_fp = app.clone();
    let app_yt = app.clone();

    let ffmpeg_task = tokio::spawn(async move { check_tool(&app_ff, Tool::FFmpeg).await });
    let ffprobe_task = tokio::spawn(async move { check_tool(&app_fp, Tool::FFprobe).await });
    let ytdlp_task = tokio::spawn(async move { check_tool(&app_yt, Tool::YTdlp).await });

    let (ffmpeg_res, ffprobe_res, ytdlp_res) = tokio::join!(ffmpeg_task, ffprobe_task, ytdlp_task);

    let mut ffmpeg = ffmpeg_res.map_err(|e| e.to_string())?;
    let mut ffprobe = ffprobe_res.map_err(|e| e.to_string())?;
    let mut ytdlp = ytdlp_res.map_err(|e| e.to_string())?;

    // Always populate the managed_* fields, regardless of which source is
    // actively resolved — the UI needs to know a managed copy exists even
    // when it's being shadowed by an env override or a PATH binary.
    // If check_tool already resolved the managed copy, reuse its path/version/mtime
    // directly without re-spawning `--version`. Probed concurrently across tools.
    let (ffmpeg_probe, ffprobe_probe, ytdlp_probe) = tokio::join!(
        resolve_or_probe_managed(&app, Tool::FFmpeg, &ffmpeg),
        resolve_or_probe_managed(&app, Tool::FFprobe, &ffprobe),
        resolve_or_probe_managed(&app, Tool::YTdlp, &ytdlp)
    );

    apply_managed_probe(&mut ffmpeg, &ffmpeg_probe);
    apply_managed_probe(&mut ffprobe, &ffprobe_probe);
    apply_managed_probe(&mut ytdlp, &ytdlp_probe);

    if let Ok(base) = app.path().app_local_data_dir() {
        let cache_path = base.join("update_cache.json");
        if let Ok(content) = tokio::fs::read_to_string(&cache_path).await {
            if let Ok(cache) = serde_json::from_str::<super::update::UpdateCache>(&content) {
                apply_update_metadata(&mut ytdlp, cache.ytdlp_tag.as_deref());
                apply_ffmpeg_freshness(
                    &mut ffmpeg,
                    cache.ffmpeg_published_at,
                    ffmpeg_probe.as_ref(),
                );
                apply_ffmpeg_freshness(
                    &mut ffprobe,
                    cache.ffmpeg_published_at,
                    ffprobe_probe.as_ref(),
                );
            }
        }
    }

    let all_installed = matches!(ffmpeg.status, DependencyStatus::Installed)
        && matches!(ffprobe.status, DependencyStatus::Installed)
        && matches!(ytdlp.status, DependencyStatus::Installed);

    Ok(DependencyReport {
        ffmpeg,
        ffprobe,
        ytdlp,
        all_installed,
    })
}

/// Fill `managed_installed` / `managed_version` / `managed_path` from an
/// already-resolved probe of the managed bin dir, independent of the
/// currently active source.
fn apply_managed_probe(
    info: &mut DependencyInfo,
    probe: &Option<(PathBuf, String, std::time::SystemTime)>,
) {
    if let Some((path, version, _mtime)) = probe {
        info.managed_installed = true;
        info.managed_version = Some(version.clone());
        info.managed_path = Some(path.to_string_lossy().to_string());
    }
}

/// Fast path: if `info` was already checked and resolved from `DependencySource::Managed`,
/// reuse its path and version directly (reading only mtime) instead of re-spawning `--version`.
async fn resolve_or_probe_managed(
    app: &AppHandle,
    tool: Tool,
    info: &DependencyInfo,
) -> Option<(PathBuf, String, std::time::SystemTime)> {
    if info.source == DependencySource::Managed && info.status == DependencyStatus::Installed {
        if let (Some(path_str), Some(version)) = (&info.path, &info.version) {
            let pb = PathBuf::from(path_str);
            if let Ok(metadata) = tokio::fs::metadata(&pb).await {
                if let Ok(mtime) = metadata.modified() {
                    return Some((pb, version.clone(), mtime));
                }
            }
        }
    }
    probe_managed(app, tool).await
}

/// yt-dlp update detection: tag-string comparison. Only ever claims an
/// update for the tool actively resolved from the managed dir — external
/// installs never get an upstream target version or an update flag.
fn apply_update_metadata(info: &mut DependencyInfo, latest_tag: Option<&str>) {
    if info.source != DependencySource::Managed {
        return;
    }

    let Some(tag) = latest_tag else {
        return;
    };
    if tag.is_empty() || tag.eq_ignore_ascii_case("latest") {
        return;
    }

    info.latest_version = Some(tag.to_string());

    if let Some(current) = &info.version {
        let normalized_current = normalize_version_for_compare(current);
        let normalized_latest = normalize_version_for_compare(tag);
        info.update_available = normalized_current != normalized_latest;
    }
}

/// FFmpeg/FFprobe update detection: BtbN's "latest" release tag is the
/// literal string "latest", so tag comparison is meaningless — compare the
/// release's published_at against the managed binary's mtime instead
/// (reusing the mtime already read by `probe_managed`, no extra fs call).
fn apply_ffmpeg_freshness(
    info: &mut DependencyInfo,
    published_at: Option<u64>,
    probe: Option<&(PathBuf, String, std::time::SystemTime)>,
) {
    if info.source != DependencySource::Managed {
        return;
    }

    let Some(published_at) = published_at else {
        return;
    };

    let Some((_, _, mtime)) = probe else {
        return;
    };

    if let Ok(mtime_secs) = mtime
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
    {
        info.update_available = published_at > mtime_secs;
        info.latest_version = Some("Latest Release".to_string());
    }
}

/// Lowercase, strip a leading `v`/`n` ONLY when followed by a digit — keeps
/// git-master strings like `N-119343-g25b0a8e295` intact while still
/// collapsing `v7.1`/`n7.1`/`7.1` to the same comparison key.
pub(crate) fn normalize_version_for_compare(raw: &str) -> String {
    let trimmed = raw.trim().to_lowercase();
    let mut chars = trimmed.chars();
    if let Some(first) = chars.next() {
        if (first == 'v' || first == 'n')
            && chars.clone().next().is_some_and(|c| c.is_ascii_digit())
        {
            return chars.as_str().to_string();
        }
    }
    trimmed
}

pub async fn get_dependency_paths(app: &AppHandle) -> Result<DependencyPaths, String> {
    let ffmpeg = resolve_tool(app, Tool::FFmpeg)
        .await
        .ok_or_else(|| "ffmpeg is not installed".to_string())?;

    let ffprobe = resolve_tool(app, Tool::FFprobe)
        .await
        .ok_or_else(|| "ffprobe is not installed".to_string())?;

    let ytdlp = resolve_tool(app, Tool::YTdlp)
        .await
        .ok_or_else(|| "yt-dlp is not installed".to_string())?;
    Ok(DependencyPaths {
        ffmpeg,
        ffprobe,
        ytdlp,
    })
}

/// Return the app's managed local-data directory path without opening it.
#[tauri::command]
pub async fn get_app_storage_path(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

static LAST_OPEN_FOLDER_TIMESTAMP: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

fn can_open_folder_debounced() -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_OPEN_FOLDER_TIMESTAMP.load(std::sync::atomic::Ordering::Relaxed);
    if now.saturating_sub(last) < 800 {
        return false;
    }
    LAST_OPEN_FOLDER_TIMESTAMP.store(now, std::sync::atomic::Ordering::Relaxed);
    true
}

#[cfg(windows)]
fn open_in_default_file_manager(path: &std::path::Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;

    let wide_path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();

    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: isize,
            lpOperation: *const u16,
            lpFile: *const u16,
            lpParameters: *const u16,
            lpDirectory: *const u16,
            nShowCmd: i32,
        ) -> isize;
    }

    let res = unsafe {
        ShellExecuteW(
            0,
            std::ptr::null(), // NULL verb uses user-configured default file manager (e.g. File Pilot)
            wide_path.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1, // SW_SHOWNORMAL
        )
    };

    if res > 32 {
        Ok(())
    } else {
        Err(format!("ShellExecute error: {res}"))
    }
}

#[cfg(not(windows))]
fn open_in_default_file_manager(path: &std::path::Path) -> Result<(), String> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn reveal_in_default_file_manager(file_path: &str) -> Result<(), String> {
    let p = std::path::Path::new(file_path);
    let folder = if p.is_file() {
        p.parent().unwrap_or(p)
    } else {
        p
    };
    open_in_default_file_manager(folder)
}

#[cfg(not(windows))]
fn reveal_in_default_file_manager(file_path: &str) -> Result<(), String> {
    tauri_plugin_opener::reveal_item_in_dir(file_path).map_err(|e| e.to_string())
}

/// Open the app's managed local-data directory in the OS file manager.
#[tauri::command]
pub async fn open_app_storage_dir(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let dir_clone = dir.clone();

    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;

    if can_open_folder_debounced() {
        tokio::task::spawn_blocking(move || {
            let _ = open_in_default_file_manager(&dir_clone);
        });
    }

    Ok(dir.to_string_lossy().to_string())
}

/// Reveal a specific dependency binary selected in its containing folder.
#[tauri::command]
pub async fn reveal_dependency_path(path: String) -> Result<(), String> {
    if can_open_folder_debounced() {
        tokio::task::spawn_blocking(move || {
            let _ = reveal_in_default_file_manager(&path);
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn get_app_storage_size_mb(app: AppHandle) -> Result<f64, String> {
    let Ok(base) = app.path().app_local_data_dir() else {
        return Ok(0.0);
    };

    if !base.exists() {
        return Ok(0.0);
    }

    let bytes = tokio::task::spawn_blocking(move || {
        let mut total_bytes: u64 = 0;
        let mut stack = vec![base];

        while let Some(dir) = stack.pop() {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    if let Ok(file_type) = entry.file_type() {
                        if file_type.is_dir() {
                            stack.push(entry.path());
                        } else if file_type.is_file() {
                            if let Ok(metadata) = entry.metadata() {
                                total_bytes += metadata.len();
                            }
                        }
                    }
                }
            }
        }
        total_bytes
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(bytes as f64 / 1_048_576.0)
}

pub(crate) async fn check_tool(app: &AppHandle, tool: Tool) -> DependencyInfo {
    let candidates = candidate_paths(app, tool).await;
    let mut last_error: Option<(PathBuf, String)> = None;

    for candidate in candidates {
        if !candidate.path.exists() {
            continue;
        }

        match read_version(&candidate.path, tool).await {
            Ok(version) => {
                let size_bytes = tokio::fs::metadata(&candidate.path)
                    .await
                    .map(|m| m.len())
                    .ok();
                let size_mb = size_bytes.map(|b| b as f64 / 1_048_576.0);
                let sha256 = compute_file_sha256(&candidate.path).await.ok();

                return DependencyInfo {
                    name: tool.name().to_string(),
                    status: DependencyStatus::Installed,
                    source: candidate.source,
                    path: Some(candidate.path.to_string_lossy().to_string()),
                    version: Some(version),
                    latest_version: None,
                    size_mb,
                    size_bytes,
                    sha256,
                    error: None,
                    managed_installed: false,
                    managed_version: None,
                    managed_path: None,
                    update_available: false,
                };
            }
            Err(error) => {
                // Don't give up on the first broken candidate — a stale
                // THEATLAS_*_PATH or a broken PATH entry shouldn't mask a
                // perfectly good managed install further down the list.
                last_error = Some((candidate.path, error));
                continue;
            }
        }
    }

    if let Some((_path, error)) = last_error {
        return DependencyInfo {
            name: tool.name().to_string(),
            status: DependencyStatus::NotInstalled,
            source: DependencySource::Missing,
            path: None,
            version: None,
            latest_version: None,
            size_mb: None,
            size_bytes: None,
            sha256: None,
            error: Some(error),
            managed_installed: false,
            managed_version: None,
            managed_path: None,
            update_available: false,
        };
    }

    DependencyInfo {
        name: tool.name().to_string(),
        status: DependencyStatus::NotInstalled,
        source: DependencySource::Missing,
        path: None,
        version: None,
        latest_version: None,
        size_mb: None,
        size_bytes: None,
        sha256: None,
        error: Some(format!("{} was not found", tool.name())),
        managed_installed: false,
        managed_version: None,
        managed_path: None,
        update_available: false,
    }
}

/// Probe the managed bin dir directly for a working copy of `tool`,
/// independent of which source is currently active for resolution.
/// Returns (path, version, mtime) when the binary exists and runs.
pub(crate) async fn probe_managed(
    app: &AppHandle,
    tool: Tool,
) -> Option<(PathBuf, String, std::time::SystemTime)> {
    let bin_dir = managed_bin_dir(app).ok()?;
    let path = bin_dir.join(tool.exe_name());

    if !path.exists() {
        return None;
    }

    let version = read_version(&path, tool).await.ok()?;
    let metadata = tokio::fs::metadata(&path).await.ok()?;
    let mtime = metadata.modified().ok()?;

    Some((path, version, mtime))
}

async fn resolve_tool(app: &AppHandle, tool: Tool) -> Option<PathBuf> {
    let candidates = candidate_paths(app, tool).await;

    for candidate in candidates {
        if !candidate.path.exists() {
            continue;
        }

        if read_version(&candidate.path, tool).await.is_ok() {
            return Some(candidate.path);
        }
    }

    None
}

#[derive(Debug, Clone)]
struct CandidatePath {
    path: PathBuf,
    source: DependencySource,
}

/// Full resolution list: the user's manually-selected path (if any) first,
/// then the auto-detected env/managed/PATH candidates in their usual order.
/// A manual selection always wins over every auto-detected candidate,
/// including an active `THEATLAS_*_PATH` env override.
async fn candidate_paths(app: &AppHandle, tool: Tool) -> Vec<CandidatePath> {
    let mut paths = Vec::new();
    let base = base_candidate_paths(app, tool);

    let prefs = load_dependency_prefs(app).await;
    if let Some(override_path) = prefs.path_for(tool) {
        let trimmed = override_path.trim();
        if !trimmed.is_empty() {
            let override_pb = PathBuf::from(trimmed);
            if override_pb.is_file() {
                // If the override happens to point at a path auto-detection
                // would already tag (env/managed/path), preserve that source
                // label instead of showing "Custom" for what is functionally a
                // known bucket — e.g. explicitly picking the managed copy to
                // win over an active env override should still read "Managed",
                // so update-checking (which is gated on source == Managed)
                // keeps working for it.
                let source = base
                    .iter()
                    .find(|c| paths_equal(&c.path, &override_pb))
                    .map(|c| c.source.clone())
                    .unwrap_or(DependencySource::Custom);

                paths.push(CandidatePath {
                    path: override_pb,
                    source,
                });
            }
        }
    }

    paths.extend(base);
    paths
}

/// Compare two paths for equality, tolerating case differences and
/// separator quirks — canonicalize when possible (resolves both to the same
/// absolute, symlink-free form), falling back to a case-insensitive string
/// compare on Windows when one side doesn't exist yet to canonicalize.
fn paths_equal(a: &Path, b: &Path) -> bool {
    if let (Ok(ca), Ok(cb)) = (a.canonicalize(), b.canonicalize()) {
        return ca == cb;
    }
    if cfg!(windows) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// The auto-detected candidates only (env override, managed, PATH scan) —
/// used both by `candidate_paths` and by the "Change Path" picker, which
/// needs to enumerate what's actually available without applying the
/// existing manual override on top.
fn base_candidate_paths(app: &AppHandle, tool: Tool) -> Vec<CandidatePath> {
    let mut paths = Vec::new();

    if let Ok(value) = env::var(tool.env_var()) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let pb = PathBuf::from(trimmed);
            if pb.is_file() {
                paths.push(CandidatePath {
                    path: pb,
                    source: DependencySource::Env,
                });
            }
        }
    }

    if let Ok(managed_dir) = managed_bin_dir(app) {
        let managed_exe = managed_dir.join(tool.exe_name());
        if managed_exe.is_file() {
            paths.push(CandidatePath {
                path: managed_exe,
                source: DependencySource::Managed,
            });
        }
    }

    for path in find_in_path(tool.exe_name()) {
        paths.push(CandidatePath {
            path,
            source: DependencySource::Path,
        });
    }

    paths
}

pub(crate) fn managed_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|err| err.to_string())?;

    Ok(base.join("bin").join(platform_dir_name()))
}

fn platform_dir_name() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "windows-x86_64"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "windows-aarch64"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "macos-x86_64"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "macos-aarch64"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "linux-x86_64"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "linux-aarch64"
    } else {
        "unknown"
    }
}

fn find_in_path(exe_name: &str) -> Vec<PathBuf> {
    let Some(path_var) = env::var_os("PATH") else {
        return Vec::new();
    };

    env::split_paths(&path_var)
        .map(|d| d.join(exe_name))
        .filter(|p| p.is_file())
        .collect()
}

pub(crate) async fn read_version(path: &Path, tool: Tool) -> Result<String, String> {
    let metadata = tokio::fs::metadata(path).await.ok();
    let len_and_mtime = metadata.and_then(|m| m.modified().ok().map(|mtime| (m.len(), mtime)));

    if let Some((len, mtime)) = len_and_mtime {
        if let Ok(cache) = version_cache().lock() {
            if let Some((cached_len, cached_mtime, cached_ver)) = cache.get(path) {
                if *cached_len == len && *cached_mtime == mtime {
                    return Ok(cached_ver.clone());
                }
            }
        }
    }

    let mut command = Command::new(path);
    command.args(tool.version_args());
    command.kill_on_drop(true);

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = timeout(Duration::from_secs(8), command.output())
        .await
        .map_err(|_| format!("{} version check timed out", tool.name()))?
        .map_err(|err| {
            format!(
                "failed to run {} at {}: {}",
                tool.name(),
                path.to_string_lossy(),
                err
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        return Err(format!(
            "{} exited with status {}: {}",
            tool.name(),
            output.status,
            stderr
        ));
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    let combined = if stdout.is_empty() { stderr } else { stdout };

    let ver = parse_version_line(tool, &combined)?;

    if let Some((len, mtime)) = len_and_mtime {
        if let Ok(mut cache) = version_cache().lock() {
            cache.insert(path.to_path_buf(), (len, mtime, ver.clone()));
        }
    }

    Ok(ver)
}

async fn dir_size_bytes(dir: &Path) -> u64 {
    let mut total_bytes: u64 = 0;
    let mut stack = vec![dir.to_path_buf()];

    while let Some(current_dir) = stack.pop() {
        if let Ok(mut read_dir) = tokio::fs::read_dir(&current_dir).await {
            while let Ok(Some(entry)) = read_dir.next_entry().await {
                if let Ok(file_type) = entry.file_type().await {
                    if file_type.is_dir() {
                        stack.push(entry.path());
                    } else if file_type.is_file() {
                        if let Ok(metadata) = entry.metadata().await {
                            total_bytes += metadata.len();
                        }
                    }
                }
            }
        }
    }

    total_bytes
}

fn get_cache_directory(app: &AppHandle) -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_data) = app.path().app_local_data_dir() {
            let p = local_data.join("EBWebView");
            if p.exists() {
                return Some(p);
            }
        }
        if let Ok(data) = app.path().app_data_dir() {
            let p = data.join("EBWebView");
            if p.exists() {
                return Some(p);
            }
        }
        app.path()
            .app_local_data_dir()
            .ok()
            .map(|d| d.join("EBWebView"))
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(data) = app.path().app_data_dir() {
            let p = data.join("WebKitCache");
            if p.exists() {
                return Some(p);
            }
        }
        app.path()
            .app_data_dir()
            .ok()
            .map(|d| d.join("WebKitCache"))
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(data) = app.path().app_cache_dir() {
            return Some(data);
        }
        app.path().app_data_dir().ok()
    }
}

#[tauri::command]
pub async fn get_webkit_cache_size_mb(app: AppHandle) -> Result<f64, String> {
    let cache_path = get_cache_directory(&app);
    if let Some(path) = cache_path {
        if !path.exists() {
            return Ok(0.0);
        }
        let total_bytes = dir_size_bytes(&path).await;
        Ok(total_bytes as f64 / 1_048_576.0)
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
pub async fn clear_webkit_cache(app: AppHandle) -> Result<f64, String> {
    let cache_path =
        get_cache_directory(&app).ok_or_else(|| "Cache directory not found".to_string())?;

    if !cache_path.exists() {
        return Ok(0.0);
    }

    let cleared_bytes = dir_size_bytes(&cache_path).await;

    let mut read_dir = tokio::fs::read_dir(&cache_path)
        .await
        .map_err(|e| e.to_string())?;

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let entry_path = entry.path();
        if let Ok(metadata) = tokio::fs::metadata(&entry_path).await {
            let _ = if metadata.is_dir() {
                tokio::fs::remove_dir_all(&entry_path).await
            } else {
                tokio::fs::remove_file(&entry_path).await
            };
        }
    }

    let size_mb = cleared_bytes as f64 / 1_048_576.0;
    log::info!(
        "Cleared {:.2} MB webview cache from {:?}",
        size_mb,
        cache_path
    );
    Ok(size_mb)
}

fn parse_version_line(tool: Tool, text: &str) -> Result<String, String> {
    let first_line = text
        .lines()
        .next()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .ok_or_else(|| format!("{} returned empty version output", tool.name()))?;

    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if let Some(pos) = parts
        .iter()
        .position(|&p| p.eq_ignore_ascii_case("version"))
    {
        if let Some(ver) = parts.get(pos + 1) {
            return Ok((*ver).to_string());
        }
    }

    if tool.name() == "yt-dlp" {
        if let Some(ver) = parts.first() {
            if *ver != "yt-dlp" {
                return Ok((*ver).to_string());
            } else if let Some(ver2) = parts.get(1) {
                return Ok((*ver2).to_string());
            }
        }
    }

    Ok(first_line.to_string())
}
