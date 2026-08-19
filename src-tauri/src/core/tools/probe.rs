//! Finding a tool on this machine, and deciding which copy wins.
//!
//! Resolution order, highest priority first:
//!
//! 1. the path the user picked in "Change Path" (`DependencyPrefs`)
//! 2. `THEATLAS_<TOOL>_PATH`
//! 3. the app-managed bin dir
//! 4. every hit for the executable name on `PATH`
//!
//! Nothing here touches Tauri. Every input arrives through [`ResolveCtx`] and
//! every cache through [`ProbeCache`], so the whole module is exercisable
//! against a temp directory — which is the point of the `core/` split.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

use tokio::process::Command;
use tokio::time::timeout;

use super::registry::ToolSpec;
use super::types::{
    CandidatePath, DependencyCandidate, DependencyInfo, DependencySource, DependencyStatus,
    ResolveCtx,
};
use crate::error::{display_path, AppError, AppResult};

/// How long a `--version` probe may take before the candidate is written off.
/// Generous: a cold binary on a spinning disk behind an on-access virus
/// scanner is genuinely slow the first time.
const VERSION_TIMEOUT: Duration = Duration::from_secs(8);

/// A value that is only valid while the file it came from is unchanged.
type FileStamped<T> = (u64, SystemTime, T);

/// Probe results that survive between commands.
///
/// `std::sync::Mutex`, not `tokio::sync::Mutex`: no guard is ever held across
/// an `.await` here, and the vault's table is explicit that the std lock is
/// the cheaper correct choice in that case. The compiler enforces the rule for
/// us — holding one of these across an await makes the command future `!Send`
/// and fails to build.
#[derive(Default)]
pub struct ProbeCache {
    versions: Mutex<HashMap<PathBuf, FileStamped<String>>>,
    hashes: Mutex<HashMap<PathBuf, FileStamped<String>>>,
    candidates: Mutex<HashMap<&'static str, Vec<DependencyCandidate>>>,
}

impl ProbeCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Drop everything. For an action that changes what is on disk: install,
    /// uninstall, update, override change.
    ///
    /// A poisoned lock is cleared rather than propagated — a panic in a
    /// probe task must not permanently wedge dependency detection.
    pub fn invalidate(&self) {
        clear(&self.versions);
        clear(&self.hashes);
        clear(&self.candidates);
    }

    /// Forget *where* the tools are, keeping what is known about each file.
    /// For "Check Paths", which re-scans the system rather than claiming the
    /// files themselves changed.
    ///
    /// Dropping the hashes here cost a full re-read of every binary — well
    /// over 100 MB for ffmpeg — to arrive at the same digests. The version
    /// cache is kept for the same reason: re-running `--version` on a binary
    /// that has not changed cannot return anything new.
    ///
    /// Safe, not merely faster: both caches are keyed by the file's size and
    /// mtime, so a binary that actually changed misses on its own and is
    /// re-read regardless.
    pub fn invalidate_locations(&self) {
        clear(&self.candidates);
    }

    pub fn cached_candidates(&self, key: &str) -> Option<Vec<DependencyCandidate>> {
        lock(&self.candidates).get(key).cloned()
    }

    pub fn store_candidates(&self, key: &'static str, candidates: &[DependencyCandidate]) {
        lock(&self.candidates).insert(key, candidates.to_vec());
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn clear<T: Default>(mutex: &Mutex<T>) {
    *lock(mutex) = T::default();
}

fn cache_get<T: Clone>(
    mutex: &Mutex<HashMap<PathBuf, FileStamped<T>>>,
    path: &Path,
    stamp: Option<(u64, SystemTime)>,
) -> Option<T> {
    let (len, mtime) = stamp?;
    let map = lock(mutex);
    let (cached_len, cached_mtime, value) = map.get(path)?;
    (*cached_len == len && *cached_mtime == mtime).then(|| value.clone())
}

fn cache_put<T>(
    mutex: &Mutex<HashMap<PathBuf, FileStamped<T>>>,
    path: PathBuf,
    stamp: Option<(u64, SystemTime)>,
    value: T,
) {
    if let Some((len, mtime)) = stamp {
        lock(mutex).insert(path, (len, mtime, value));
    }
}

/// `(size, mtime)` for a file, or `None` if it cannot be stat'd — in which
/// case nothing about it is cacheable.
async fn file_stamp(path: &Path) -> Option<(u64, SystemTime)> {
    let metadata = tokio::fs::metadata(path).await.ok()?;
    let mtime = metadata.modified().ok()?;
    Some((metadata.len(), mtime))
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/// SHA-256 of a file, cached against its size and mtime.
///
/// Hashing runs on the blocking pool: it is CPU-bound over the whole file, and
/// a 150 MB ffmpeg binary would otherwise stall a runtime worker for the
/// duration.
pub async fn file_sha256(path: &Path, cache: &ProbeCache) -> AppResult<String> {
    use sha2::{Digest, Sha256};

    let stamp = file_stamp(path).await;
    if let Some(hit) = cache_get(&cache.hashes, path, stamp) {
        return Ok(hit);
    }

    let owned = path.to_path_buf();
    let hash = tokio::task::spawn_blocking(move || -> AppResult<String> {
        use std::io::Read;

        let mut file = std::fs::File::open(&owned)?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 65_536];

        loop {
            let read = file.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }

        Ok(format!("{:x}", hasher.finalize()))
    })
    .await??;

    cache_put(&cache.hashes, path.to_path_buf(), stamp, hash.clone());
    Ok(hash)
}

// ---------------------------------------------------------------------------
// Version reading
// ---------------------------------------------------------------------------

/// Run a binary's version flag and parse the answer, cached against size and
/// mtime so repeated reports do not re-spawn three processes.
pub async fn read_version(path: &Path, spec: &ToolSpec, cache: &ProbeCache) -> AppResult<String> {
    let stamp = file_stamp(path).await;
    if let Some(hit) = cache_get(&cache.versions, path, stamp) {
        return Ok(hit);
    }

    let mut command = Command::new(path);
    // An args array, never a shell string — the path is attacker-influenced
    // (it can come from a picker or an env var) and this is the one place the
    // app hands it to the OS.
    command.args(spec.version_args);
    command.kill_on_drop(true);

    #[cfg(windows)]
    {
        // Without this every probe flashes a console window; three tools ×
        // several PATH hits made the app strobe on startup.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = timeout(VERSION_TIMEOUT, command.output())
        .await
        .map_err(|_| {
            AppError::subprocess(format!("{} version check timed out", spec.display_name))
        })?
        .map_err(|error| {
            AppError::subprocess(format!(
                "failed to run {} at {}: {error}",
                spec.display_name,
                display_path(path)
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::subprocess(format!(
            "{} exited with status {}: {stderr}",
            spec.display_name, output.status
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let combined = if stdout.is_empty() { stderr } else { stdout };

    let version = parse_version_line(spec, &combined)?;
    cache_put(&cache.versions, path.to_path_buf(), stamp, version.clone());
    Ok(version)
}

/// Pull a version out of a tool's first line of output.
///
/// `ffmpeg -version` prints `ffmpeg version n7.1 Copyright …`; `yt-dlp
/// --version` prints the bare version on its own. Both shapes are handled
/// without a per-tool parser function, which is why `ToolSpec` carries only
/// the flag and not a callback.
pub fn parse_version_line(spec: &ToolSpec, text: &str) -> AppResult<String> {
    let first_line = text
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .ok_or_else(|| {
            AppError::subprocess(format!(
                "{} returned empty version output",
                spec.display_name
            ))
        })?;

    let parts: Vec<&str> = first_line.split_whitespace().collect();

    if let Some(position) = parts.iter().position(|p| p.eq_ignore_ascii_case("version")) {
        if let Some(version) = parts.get(position + 1) {
            return Ok((*version).to_string());
        }
    }

    // A single bare token is the version itself — the yt-dlp case, and any
    // future tool that prints one too.
    if parts.len() == 1 && !parts[0].eq_ignore_ascii_case(spec.exe_stem) {
        return Ok(parts[0].to_string());
    }

    if let Some(first) = parts.first() {
        if first.eq_ignore_ascii_case(spec.exe_stem) {
            if let Some(second) = parts.get(1) {
                return Ok((*second).to_string());
            }
        }
    }

    Ok(first_line.to_string())
}

/// Lowercase, strip a leading `v`/`n` ONLY when followed by a digit — keeps
/// git-master strings like `N-119343-g25b0a8e295` intact while still
/// collapsing `v7.1`/`n7.1`/`7.1` to the same comparison key.
pub fn normalize_version_for_compare(raw: &str) -> String {
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

// ---------------------------------------------------------------------------
// Candidate discovery
// ---------------------------------------------------------------------------

/// The auto-detected candidates only — env override, managed copy, PATH scan.
///
/// Separate from [`candidate_paths`] because the "Change Path" picker needs to
/// enumerate what is available *without* the existing manual override applied
/// on top; otherwise the current choice would shadow the alternatives it is
/// meant to be offering.
pub fn base_candidate_paths(spec: &ToolSpec, managed_bin_dir: &Path) -> Vec<CandidatePath> {
    let mut paths = Vec::new();
    let exe_name = spec.exe_name();

    if let Ok(value) = std::env::var(spec.env_var) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_file() {
                paths.push(CandidatePath {
                    path,
                    source: DependencySource::Env,
                });
            }
        }
    }

    let managed = managed_bin_dir.join(&exe_name);
    if managed.is_file() {
        paths.push(CandidatePath {
            path: managed,
            source: DependencySource::Managed,
        });
    }

    for path in find_in_path(&exe_name) {
        paths.push(CandidatePath {
            path,
            source: DependencySource::Path,
        });
    }

    paths
}

/// Full resolution list: the manual override first, then the auto-detected
/// candidates in their usual order.
pub fn candidate_paths(spec: &ToolSpec, ctx: &ResolveCtx) -> Vec<CandidatePath> {
    let base = base_candidate_paths(spec, &ctx.managed_bin_dir);
    let mut paths = Vec::with_capacity(base.len() + 1);

    if let Some(override_path) = ctx.prefs.path_for(spec.key) {
        let path = PathBuf::from(override_path);
        if path.is_file() {
            // If the override happens to point at a path auto-detection would
            // already tag, keep that label instead of "Custom": deliberately
            // picking the managed copy so it beats an env override should
            // still read "Managed", because update checking is gated on it.
            let source = base
                .iter()
                .find(|candidate| paths_equal(&candidate.path, &path))
                .map(|candidate| candidate.source.clone())
                .unwrap_or(DependencySource::Custom);

            paths.push(CandidatePath { path, source });
        }
    }

    paths.extend(base);
    paths
}

fn find_in_path(exe_name: &str) -> Vec<PathBuf> {
    let Some(path_var) = std::env::var_os("PATH") else {
        return Vec::new();
    };

    std::env::split_paths(&path_var)
        .map(|dir| dir.join(exe_name))
        .filter(|path| path.is_file())
        .collect()
}

/// Compare two paths, tolerating case and separator differences.
///
/// Canonicalizing resolves both to the same absolute, symlink-free form; the
/// fallback matters when one side does not exist yet to be canonicalized.
pub fn paths_equal(a: &Path, b: &Path) -> bool {
    if let (Ok(ca), Ok(cb)) = (a.canonicalize(), b.canonicalize()) {
        return ca == cb;
    }

    if cfg!(windows) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// Probe every existing, de-duplicated candidate concurrently.
///
/// Each probe spawns the binary and stats it, so doing them in sequence made
/// the total the *sum* over a long `PATH`; fanned out, it is the slowest
/// single probe instead.
pub async fn probe_candidates(
    spec: &'static ToolSpec,
    ctx: &ResolveCtx,
    cache: &Arc<ProbeCache>,
) -> Vec<DependencyCandidate> {
    let mut seen = HashSet::new();
    let mut unique = Vec::new();

    for candidate in base_candidate_paths(spec, &ctx.managed_bin_dir) {
        if !candidate.path.exists() {
            continue;
        }
        let key = candidate.path.to_string_lossy().to_string();
        // The managed dir is sometimes also on PATH; one entry, not two.
        if !seen.insert(key.clone()) {
            continue;
        }
        unique.push((candidate, key));
    }

    let mut tasks = tokio::task::JoinSet::new();
    for (candidate, path_string) in unique {
        let cache = Arc::clone(cache);
        tasks.spawn(async move {
            let version = read_version(&candidate.path, spec, &cache).await.ok();
            let size_bytes = tokio::fs::metadata(&candidate.path)
                .await
                .map(|m| m.len())
                .ok();

            DependencyCandidate {
                source: candidate.source,
                path: path_string,
                working: version.is_some(),
                version,
                size_bytes,
            }
        });
    }

    let mut results = Vec::new();
    while let Some(joined) = tasks.join_next().await {
        if let Ok(candidate) = joined {
            results.push(candidate);
        }
    }

    // JoinSet completes out of order; the picker lists these top to bottom and
    // a list that reshuffles between openings looks broken.
    results.sort_by_key(|candidate| source_rank(&candidate.source));
    results
}

fn source_rank(source: &DependencySource) -> u8 {
    match source {
        DependencySource::Custom => 0,
        DependencySource::Env => 1,
        DependencySource::Managed => 2,
        DependencySource::Path => 3,
        DependencySource::Missing => 4,
    }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/// Walk the resolution order and describe the first copy that actually runs.
pub async fn check_tool(spec: &ToolSpec, ctx: &ResolveCtx, cache: &ProbeCache) -> DependencyInfo {
    let mut last_error: Option<String> = None;

    for candidate in candidate_paths(spec, ctx) {
        if !candidate.path.exists() {
            continue;
        }

        match read_version(&candidate.path, spec, cache).await {
            Ok(version) => {
                let size_bytes = tokio::fs::metadata(&candidate.path)
                    .await
                    .map(|m| m.len())
                    .ok();

                return DependencyInfo {
                    name: spec.key.to_string(),
                    status: DependencyStatus::Installed,
                    source: candidate.source,
                    path: Some(candidate.path.to_string_lossy().to_string()),
                    version: Some(version),
                    latest_version: None,
                    size_mb: size_bytes.map(bytes_to_mb),
                    size_bytes,
                    sha256: file_sha256(&candidate.path, cache).await.ok(),
                    error: None,
                    managed_installed: false,
                    managed_version: None,
                    managed_path: None,
                    update_available: false,
                };
            }
            Err(error) => {
                // Don't give up on the first broken candidate — a stale
                // THEATLAS_*_PATH or a dead PATH entry must not mask a
                // perfectly good managed install further down the list.
                last_error = Some(error.to_string());
            }
        }
    }

    DependencyInfo::missing(
        spec.key,
        last_error.unwrap_or_else(|| format!("{} was not found", spec.display_name)),
    )
}

/// Probe the managed bin dir directly, whichever source is currently winning.
/// Returns `(path, version, mtime)` when the binary exists and runs.
pub async fn probe_managed(
    spec: &ToolSpec,
    ctx: &ResolveCtx,
    cache: &ProbeCache,
) -> Option<(PathBuf, String, SystemTime)> {
    let path = spec.exe_path_in(&ctx.managed_bin_dir);
    if !path.exists() {
        return None;
    }

    let version = read_version(&path, spec, cache).await.ok()?;
    let mtime = tokio::fs::metadata(&path).await.ok()?.modified().ok()?;
    Some((path, version, mtime))
}

/// Fast path for the managed probe: when the tool already resolved *from* the
/// managed dir, its path and version are known — only the mtime is missing,
/// and re-spawning `--version` for it is pure waste.
pub async fn resolve_or_probe_managed(
    spec: &ToolSpec,
    ctx: &ResolveCtx,
    cache: &ProbeCache,
    info: &DependencyInfo,
) -> Option<(PathBuf, String, SystemTime)> {
    if info.source == DependencySource::Managed && info.status == DependencyStatus::Installed {
        if let (Some(path), Some(version)) = (&info.path, &info.version) {
            let path = PathBuf::from(path);
            if let Some((_, mtime)) = file_stamp(&path).await {
                return Some((path, version.clone(), mtime));
            }
        }
    }

    probe_managed(spec, ctx, cache).await
}

/// The path a caller should actually execute, or `None` if nothing works.
pub async fn resolve_tool(
    spec: &ToolSpec,
    ctx: &ResolveCtx,
    cache: &ProbeCache,
) -> Option<PathBuf> {
    for candidate in candidate_paths(spec, ctx) {
        if candidate.path.exists() && read_version(&candidate.path, spec, cache).await.is_ok() {
            return Some(candidate.path);
        }
    }
    None
}

/// Fill the `managed_*` fields from an already-resolved probe.
pub fn apply_managed_probe(
    info: &mut DependencyInfo,
    probe: &Option<(PathBuf, String, SystemTime)>,
) {
    if let Some((path, version, _)) = probe {
        info.managed_installed = true;
        info.managed_version = Some(version.clone());
        info.managed_path = Some(path.to_string_lossy().to_string());
    }
}

pub fn bytes_to_mb(bytes: u64) -> f64 {
    bytes as f64 / 1_048_576.0
}

/// Sub-directory of the managed bin dir for this OS/architecture, so a synced
/// or copied app-data folder cannot hand a Linux binary to a Windows install.
pub fn platform_dir_name() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::tools::registry;
    use crate::core::tools::types::DependencyPrefs;

    fn ffmpeg() -> &'static ToolSpec {
        registry::tool("ffmpeg").expect("ffmpeg is in the registry")
    }

    fn ytdlp() -> &'static ToolSpec {
        registry::tool("yt-dlp").expect("yt-dlp is in the registry")
    }

    #[test]
    fn parses_the_ffmpeg_banner() {
        let text =
            "ffmpeg version n7.1 Copyright (c) 2000-2024 the FFmpeg developers\nbuilt with gcc";
        assert_eq!(parse_version_line(ffmpeg(), text).unwrap(), "n7.1");
    }

    #[test]
    fn parses_a_bare_ytdlp_version() {
        assert_eq!(
            parse_version_line(ytdlp(), "2025.08.11").unwrap(),
            "2025.08.11"
        );
    }

    #[test]
    fn parses_a_prefixed_ytdlp_version() {
        assert_eq!(
            parse_version_line(ytdlp(), "yt-dlp 2025.08.11").unwrap(),
            "2025.08.11"
        );
    }

    #[test]
    fn skips_a_leading_blank_line() {
        assert_eq!(
            parse_version_line(ytdlp(), "\n\n2025.08.11").unwrap(),
            "2025.08.11"
        );
    }

    #[test]
    fn empty_output_is_an_error_not_an_empty_version() {
        assert!(parse_version_line(ytdlp(), "   \n  ").is_err());
    }

    #[test]
    fn version_normalization_collapses_v_and_n_prefixes() {
        assert_eq!(normalize_version_for_compare("v7.1"), "7.1");
        assert_eq!(normalize_version_for_compare("n7.1"), "7.1");
        assert_eq!(normalize_version_for_compare(" 7.1 "), "7.1");
    }

    #[test]
    fn version_normalization_leaves_git_master_strings_alone() {
        // The `N-` prefix is not a version prefix — stripping it would make
        // two different master builds compare equal.
        assert_eq!(
            normalize_version_for_compare("N-119343-g25b0a8e295"),
            "n-119343-g25b0a8e295"
        );
    }

    #[test]
    fn platform_dir_name_is_os_and_arch() {
        let name = platform_dir_name();
        assert!(name.contains(std::env::consts::OS));
        assert!(name.contains(std::env::consts::ARCH));
    }

    #[tokio::test]
    async fn a_managed_copy_is_found_in_the_managed_dir() {
        let dir = tempdir();
        let exe = ffmpeg().exe_path_in(&dir);
        std::fs::write(&exe, b"not really a binary").unwrap();

        let found = base_candidate_paths(ffmpeg(), &dir);
        assert!(found
            .iter()
            .any(|c| c.source == DependencySource::Managed && c.path == exe));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_manual_override_outranks_every_auto_detected_candidate() {
        let dir = tempdir();
        let managed = ffmpeg().exe_path_in(&dir);
        std::fs::write(&managed, b"managed").unwrap();

        let picked = dir.join("elsewhere.exe");
        std::fs::write(&picked, b"picked").unwrap();

        let mut prefs = DependencyPrefs::default();
        prefs.set_path_for("ffmpeg", Some(picked.to_string_lossy().to_string()));

        let ctx = ResolveCtx {
            managed_bin_dir: dir.clone(),
            prefs,
        };

        let order = candidate_paths(ffmpeg(), &ctx);
        assert_eq!(order[0].path, picked);
        assert_eq!(order[0].source, DependencySource::Custom);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn an_override_pointing_at_the_managed_copy_keeps_the_managed_label() {
        // Not cosmetic: update checking only runs for `Managed`, so labelling
        // this "Custom" would silently stop offering updates for it.
        let dir = tempdir();
        let managed = ffmpeg().exe_path_in(&dir);
        std::fs::write(&managed, b"managed").unwrap();

        let mut prefs = DependencyPrefs::default();
        prefs.set_path_for("ffmpeg", Some(managed.to_string_lossy().to_string()));

        let ctx = ResolveCtx {
            managed_bin_dir: dir.clone(),
            prefs,
        };

        assert_eq!(
            candidate_paths(ffmpeg(), &ctx)[0].source,
            DependencySource::Managed
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_dangling_override_is_ignored_rather_than_fatal() {
        let dir = tempdir();
        let managed = ffmpeg().exe_path_in(&dir);
        std::fs::write(&managed, b"managed").unwrap();

        let mut prefs = DependencyPrefs::default();
        prefs.set_path_for(
            "ffmpeg",
            Some(dir.join("gone.exe").to_string_lossy().to_string()),
        );

        let ctx = ResolveCtx {
            managed_bin_dir: dir.clone(),
            prefs,
        };

        let order = candidate_paths(ffmpeg(), &ctx);
        assert_eq!(order[0].source, DependencySource::Managed);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_empty_managed_dir_offers_no_managed_candidate() {
        // Deliberately not asserting on `check_tool` here: it also scans the
        // real `PATH`, so on a developer machine with ffmpeg installed the
        // "nothing found" case is unreachable and the test would assert about
        // the machine rather than the code.
        let dir = tempdir();
        let found = base_candidate_paths(ffmpeg(), &dir.join("empty"));

        assert!(found
            .iter()
            .all(|candidate| candidate.source != DependencySource::Managed));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_missing_record_is_consistent() {
        let info = DependencyInfo::missing("ffmpeg", "ffmpeg was not found");

        assert_eq!(info.status, DependencyStatus::NotInstalled);
        assert_eq!(info.source, DependencySource::Missing);
        assert_eq!(info.error.as_deref(), Some("ffmpeg was not found"));
        assert!(info.path.is_none() && info.version.is_none());
        assert!(!info.managed_installed && !info.update_available);
    }

    #[tokio::test]
    async fn a_broken_candidate_does_not_mask_a_working_one_behind_it() {
        // The regression this guards: a stale THEATLAS_*_PATH or a dead PATH
        // entry used to end resolution at the first failure, hiding a
        // perfectly good managed install further down the list.
        let dir = tempdir();
        let broken = dir.join("broken.exe");
        std::fs::write(&broken, b"not an executable").unwrap();

        let mut prefs = DependencyPrefs::default();
        prefs.set_path_for("ffmpeg", Some(broken.to_string_lossy().to_string()));

        let ctx = ResolveCtx {
            managed_bin_dir: dir.clone(),
            prefs,
        };

        let order = candidate_paths(ffmpeg(), &ctx);
        assert_eq!(
            order[0].path, broken,
            "the override should still be tried first"
        );

        // And resolution must keep going past it rather than stopping there.
        let info = check_tool(ffmpeg(), &ctx, &ProbeCache::new()).await;
        assert_ne!(
            info.path.as_deref(),
            Some(broken.to_string_lossy().as_ref()),
            "a candidate that will not run must never be reported as installed"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn hashing_is_cached_and_correct() {
        let dir = tempdir();
        let file = dir.join("payload.bin");
        std::fs::write(&file, b"abc").unwrap();

        let cache = ProbeCache::new();
        let first = file_sha256(&file, &cache).await.unwrap();
        // Known SHA-256 of "abc".
        assert_eq!(
            first,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(file_sha256(&file, &cache).await.unwrap(), first);

        cache.invalidate();
        assert_eq!(file_sha256(&file, &cache).await.unwrap(), first);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_path_rescan_keeps_hashes_but_forgets_locations() {
        // "Check Paths" asks where the tools are, not whether the files
        // changed. Re-hashing a 100 MB binary to reach the same digest is the
        // regression this guards.
        let dir = tempdir();
        let file = dir.join("payload.bin");
        std::fs::write(&file, b"abc").unwrap();

        let cache = ProbeCache::new();
        let hash = file_sha256(&file, &cache).await.unwrap();
        cache_put(
            &cache.versions,
            file.clone(),
            file_stamp(&file).await,
            "1.2.3".to_string(),
        );
        cache.store_candidates(
            "ffmpeg",
            &[DependencyCandidate {
                source: DependencySource::Managed,
                path: "/x".into(),
                version: None,
                working: true,
                size_bytes: None,
            }],
        );

        cache.invalidate_locations();

        assert!(
            cache.cached_candidates("ffmpeg").is_none(),
            "locations must be forgotten"
        );
        assert_eq!(
            cache_get(&cache.hashes, &file, file_stamp(&file).await),
            Some(hash),
            "the hash must survive a path rescan"
        );
        assert_eq!(
            cache_get(&cache.versions, &file, file_stamp(&file).await).as_deref(),
            Some("1.2.3"),
            "the version must survive a path rescan too"
        );

        // The full invalidation still drops everything.
        cache.invalidate();
        assert_eq!(
            cache_get(&cache.hashes, &file, file_stamp(&file).await),
            None
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_changed_file_is_rehashed_even_though_the_cache_was_kept() {
        // Why keeping hashes across a rescan is safe: entries are keyed by
        // size and mtime, so an edited binary misses the cache by itself.
        let dir = tempdir();
        let file = dir.join("payload.bin");
        std::fs::write(&file, b"abc").unwrap();

        let cache = ProbeCache::new();
        let before = file_sha256(&file, &cache).await.unwrap();

        cache.invalidate_locations();
        std::fs::write(&file, b"totally different contents").unwrap();

        let after = file_sha256(&file, &cache).await.unwrap();
        assert_ne!(before, after, "a changed file must not reuse a stale hash");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn candidate_cache_round_trips_and_clears() {
        let cache = ProbeCache::new();
        assert!(cache.cached_candidates("ffmpeg").is_none());

        cache.store_candidates(
            "ffmpeg",
            &[DependencyCandidate {
                source: DependencySource::Managed,
                path: "/x".into(),
                version: None,
                working: false,
                size_bytes: None,
            }],
        );
        assert_eq!(cache.cached_candidates("ffmpeg").map(|c| c.len()), Some(1));

        cache.invalidate();
        assert!(cache.cached_candidates("ffmpeg").is_none());
    }

    /// A unique scratch directory. `std::env::temp_dir` plus a counter rather
    /// than a dev-dependency: the tests only need a path nothing else owns.
    fn tempdir() -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let dir = std::env::temp_dir().join(format!(
            "theatlas-probe-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }
}
