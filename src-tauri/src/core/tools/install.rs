//! Installing a bundle: manifest, download, verify, extract, verify again.
//!
//! One code path for every tool. The old version had an `install_ffmpeg` and
//! an `install_ytdlp` that differed only in which URL they fetched and whether
//! they unpacked anything — and had drifted, so the two verified their
//! downloads through slightly different helpers. Both shapes now fall out of
//! the `BundleSpec` in `registry.rs`.
//!
//! The stage sink is a closure. Nothing here knows an `install-progress` event
//! exists, which is what lets the command layer switch to scoped
//! `progress:{job_id}` events later without touching this file.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::download::{self, DownloadProgress};
use super::extract;
use super::probe::{read_version, ProbeCache};
use super::registry::{ArchiveKind, BundleSpec, ToolSpec};
use super::verify;
use crate::error::{AppError, AppResult};

/// Where an install has got to. Serialized straight to the frontend, which
/// renders a different affordance per stage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallStage {
    CheckingManifest,
    Downloading,
    Extracting,
    Verifying,
    Installed,
    Failed,
}

/// One progress tick for one tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub name: String,
    pub status: InstallStage,
    pub progress: f64,
    pub message: String,
}

/// What an install did, for the journal and the log.
#[derive(Debug, Clone)]
pub struct InstallOutcome {
    /// Manifest name of the artifact that was fetched.
    pub artifact: String,
    pub sha256: String,
    pub bytes: u64,
    /// Tool keys that ended up installed.
    pub installed: Vec<&'static str>,
}

pub struct InstallRequest<'a> {
    pub bundle: &'static BundleSpec,
    /// Which of the bundle's tools to keep. Requesting one of a two-tool
    /// bundle still downloads the whole archive — there is only one — but
    /// extracts only what was asked for.
    pub tools: Vec<&'static ToolSpec>,
    pub bin_dir: &'a Path,
    pub http: &'a reqwest::Client,
    pub cache: &'a ProbeCache,
}

/// Run a full install. `on_stage` is called with `(stage, percent, message)`.
pub async fn install_bundle<F>(
    request: InstallRequest<'_>,
    mut on_stage: F,
) -> AppResult<InstallOutcome>
where
    F: FnMut(InstallStage, f64, String),
{
    let InstallRequest {
        bundle,
        tools,
        bin_dir,
        http,
        cache,
    } = request;

    if tools.is_empty() {
        return Err(AppError::validation("no tools requested for this bundle"));
    }

    let build = bundle
        .current_build()
        .ok_or(AppError::UnsupportedPlatform)?;

    tokio::fs::create_dir_all(bin_dir).await?;

    // ── Manifest ────────────────────────────────────────────────────────────
    on_stage(
        InstallStage::CheckingManifest,
        0.0,
        format!("Fetching the {} release manifest…", bundle.key),
    );

    let manifest = download::fetch_text(http, bundle.checksum_url).await?;
    let expected = verify::parse_manifest(&manifest, bundle.checksum_format, build.manifest_name)?;

    // ── Download ────────────────────────────────────────────────────────────
    //
    // A raw download lands on a staging name, not its final one. Writing
    // straight to `yt-dlp.exe` would leave a half-written binary in the
    // managed directory if the transfer failed — and the resolver would then
    // find it, try to run it, and report the tool as broken rather than absent.
    let download_path = match build.archive {
        ArchiveKind::Raw => bin_dir.join(format!("{}.download", bundle.key)),
        kind => bin_dir.join(format!("{}-download.{}", bundle.key, kind.extension())),
    };

    on_stage(InstallStage::Downloading, 0.0, "Starting download…".into());

    let bytes = download::download_to_file(http, build.url, &download_path, |progress| {
        on_stage(
            InstallStage::Downloading,
            progress.percent,
            format_download_message(&progress),
        );
    })
    .await?;

    // ── Verify the artifact ─────────────────────────────────────────────────
    on_stage(
        InstallStage::Verifying,
        0.0,
        "Verifying SHA-256 checksum…".into(),
    );

    let sha256 = match verify::verify_download(&download_path, &expected, cache).await {
        Ok(hash) => hash,
        Err(error) => {
            // `verify_download` already removed the artifact; this catches the
            // staging file in the raw case where the two differ.
            let _ = tokio::fs::remove_file(&download_path).await;
            return Err(error);
        }
    };

    // ── Put the binaries in place ───────────────────────────────────────────
    on_stage(InstallStage::Extracting, 0.0, "Installing binaries…".into());

    let wanted: Vec<String> = tools.iter().map(|tool| tool.exe_name()).collect();

    let placed = match build.archive {
        ArchiveKind::Raw => {
            // Exactly one tool can come out of a raw download; the registry
            // guarantees it, but a mistake there should be an error and not a
            // silently half-installed bundle.
            let [tool] = tools.as_slice() else {
                let _ = tokio::fs::remove_file(&download_path).await;
                return Err(AppError::validation(format!(
                    "bundle '{}' is a single binary but {} tools were requested",
                    bundle.key,
                    tools.len()
                )));
            };

            let dest = tool.exe_path_in(bin_dir);
            tokio::fs::rename(&download_path, &dest).await?;
            vec![dest]
        }
        kind => {
            let placed = extract::extract(&download_path, bin_dir, kind, &wanted).await;
            let _ = tokio::fs::remove_file(&download_path).await;
            placed?
        }
    };

    if placed.len() != tools.len() {
        return Err(AppError::extraction(format!(
            "expected {} binaries from '{}' but got {}",
            tools.len(),
            bundle.key,
            placed.len()
        )));
    }

    for path in &placed {
        extract::set_executable(path)?;
    }

    // A new binary at a path the caches already know about invalidates both
    // the version and the hash entry for it.
    cache.invalidate();

    // ── Verify the binaries run ─────────────────────────────────────────────
    on_stage(
        InstallStage::Verifying,
        0.0,
        "Verifying installed binaries…".into(),
    );

    for tool in &tools {
        let path = tool.exe_path_in(bin_dir);
        read_version(&path, tool, cache).await.map_err(|error| {
            AppError::verification(format!(
                "{} was installed but will not run: {error}",
                tool.display_name
            ))
        })?;
    }

    on_stage(
        InstallStage::Installed,
        100.0,
        "Installed successfully".into(),
    );

    Ok(InstallOutcome {
        artifact: build.manifest_name.to_string(),
        sha256,
        bytes,
        installed: tools.iter().map(|tool| tool.key).collect(),
    })
}

/// Remove a tool's managed copy. Returns whether a file was actually deleted.
pub async fn uninstall_tool(tool: &ToolSpec, bin_dir: &Path) -> AppResult<bool> {
    let path = tool.exe_path_in(bin_dir);

    match tokio::fs::remove_file(&path).await {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(AppError::io(format!(
            "could not remove {}: {error}",
            tool.display_name
        ))),
    }
}

fn format_download_message(progress: &DownloadProgress) -> String {
    let done = progress.downloaded as f64 / 1_048_576.0;

    match progress.total {
        Some(total) => {
            let total = total as f64 / 1_048_576.0;
            if progress.speed_bps > 0.0 {
                format!(
                    "{done:.1} / {total:.1} MB  •  {}",
                    download::format_speed(progress.speed_bps)
                )
            } else {
                format!("{done:.1} / {total:.1} MB")
            }
        }
        None => format!("{done:.1} MB downloaded"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::tools::registry;

    #[test]
    fn download_message_shows_speed_while_moving() {
        let progress = DownloadProgress {
            downloaded: 5 * 1_048_576,
            total: Some(10 * 1_048_576),
            percent: 50.0,
            speed_bps: 2.0 * 1_048_576.0,
        };
        assert_eq!(
            format_download_message(&progress),
            "5.0 / 10.0 MB  •  2.0 MB/s"
        );
    }

    #[test]
    fn download_message_drops_speed_on_the_final_tick() {
        // The synthetic 100% tick reports no speed; showing "< 1 KB/s" at the
        // end of a fast download reads as a stall.
        let progress = DownloadProgress {
            downloaded: 10 * 1_048_576,
            total: Some(10 * 1_048_576),
            percent: 100.0,
            speed_bps: 0.0,
        };
        assert_eq!(format_download_message(&progress), "10.0 / 10.0 MB");
    }

    #[test]
    fn download_message_copes_with_an_unknown_total() {
        let progress = DownloadProgress {
            downloaded: 3 * 1_048_576,
            total: None,
            percent: 0.0,
            speed_bps: 0.0,
        };
        assert_eq!(format_download_message(&progress), "3.0 MB downloaded");
    }

    #[test]
    fn install_stage_serializes_to_the_names_the_frontend_switches_on() {
        let json = serde_json::to_string(&InstallStage::CheckingManifest).unwrap();
        assert_eq!(json, "\"checkingManifest\"");
    }

    #[tokio::test]
    async fn uninstalling_something_absent_is_not_an_error() {
        let dir = std::env::temp_dir().join(format!("theatlas-uninstall-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let tool = registry::tool("ffmpeg").unwrap();
        assert!(!uninstall_tool(tool, &dir).await.unwrap());

        std::fs::write(tool.exe_path_in(&dir), b"binary").unwrap();
        assert!(uninstall_tool(tool, &dir).await.unwrap());
        assert!(!tool.exe_path_in(&dir).exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn an_empty_tool_list_is_rejected_before_any_network_call() {
        let cache = ProbeCache::new();
        let http = download::build_client("test").unwrap();
        let dir = std::env::temp_dir();

        let error = install_bundle(
            InstallRequest {
                bundle: registry::bundle("ffmpeg").unwrap(),
                tools: Vec::new(),
                bin_dir: &dir,
                http: &http,
                cache: &cache,
            },
            |_, _, _| {},
        )
        .await
        .unwrap_err();

        assert_eq!(error.kind(), "validation");
    }
}
