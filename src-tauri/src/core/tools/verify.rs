//! Checksum manifests, artifact verification, and the install journal.
//!
//! ## What this protects against, and what it does not
//!
//! Every managed download is SHA-256 checked against a manifest published
//! alongside it. That defeats transport corruption and a hostile mirror — but
//! **not** a compromised release, because an attacker who can replace the
//! binary in a GitHub release can replace `checksums.sha256` in the same
//! release. The two come from the same origin, so they are one signal, not two.
//!
//! The genuine fix is a pinned release tag with a hash recorded out of band.
//! Both of this app's upstreams publish under a rolling `latest` tag whose
//! contents change on every build, so a trust-on-first-use rule would fire on
//! every legitimate update and teach the user to click through it — worse than
//! nothing. Until tags are pinned, what this module adds on top of the hash
//! check is:
//!
//! - **Ambiguity rejection** — a manifest listing the same file twice with
//!   different hashes is refused rather than resolved by first-match.
//! - **Shape validation** — the entry must be 64 hex characters, so a 404 page
//!   or an HTML error body cannot be parsed into a "hash" that then fails to
//!   match for the wrong reason.
//! - **An install journal** — every accepted artifact is recorded with its
//!   hash and a timestamp, so "did my ffmpeg silently change?" is answerable
//!   after the fact.
//!
//! The journal is an audit trail, not a gate. It is deliberately not wired to
//! block an install; see the note above for why.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::probe::{file_sha256, ProbeCache};
use super::registry::ManifestFormat;
use crate::error::{AppError, AppResult};

/// One accepted artifact, as recorded in the journal.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactRecord {
    /// File name as published in the checksum manifest.
    pub artifact: String,
    pub sha256: String,
    /// Unix seconds when this hash was first accepted.
    pub first_seen: u64,
    /// Unix seconds of the most recent install that accepted it.
    pub last_seen: u64,
    /// How many distinct hashes this artifact name has had. A rolling
    /// `latest` tag legitimately increments this on every upstream release.
    pub revision: u32,
}

/// The journal file's contents.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ArtifactJournal {
    pub entries: std::collections::BTreeMap<String, ArtifactRecord>,
}

impl ArtifactJournal {
    /// Record an accepted hash. Returns `true` when the artifact's hash has
    /// changed since the last install — expected for a rolling release, worth
    /// logging, never a reason to refuse.
    pub fn record(&mut self, artifact: &str, sha256: &str, now: u64) -> bool {
        match self.entries.get_mut(artifact) {
            Some(existing) if existing.sha256 == sha256 => {
                existing.last_seen = now;
                false
            }
            Some(existing) => {
                existing.sha256 = sha256.to_string();
                existing.first_seen = now;
                existing.last_seen = now;
                existing.revision = existing.revision.saturating_add(1);
                true
            }
            None => {
                self.entries.insert(
                    artifact.to_string(),
                    ArtifactRecord {
                        artifact: artifact.to_string(),
                        sha256: sha256.to_string(),
                        first_seen: now,
                        last_seen: now,
                        revision: 1,
                    },
                );
                false
            }
        }
    }
}

/// Pull the expected hash for `filename` out of a published manifest.
///
/// Scans every line rather than stopping at the first hit, so a manifest that
/// contradicts itself is an error instead of a coin flip.
pub fn parse_manifest(text: &str, format: ManifestFormat, filename: &str) -> AppResult<String> {
    let mut found: Option<String> = None;

    for line in text.lines() {
        let Some((hash, name)) = split_entry(line, format) else {
            continue;
        };

        // The coreutils convention marks binary mode with a leading `*`.
        if name.trim().trim_start_matches('*') != filename {
            continue;
        }

        let hash = hash.trim().to_lowercase();
        if !is_sha256_hex(&hash) {
            return Err(AppError::verification(format!(
                "manifest entry for '{filename}' is not a SHA-256 hash"
            )));
        }

        match &found {
            Some(previous) if *previous != hash => {
                return Err(AppError::verification(format!(
                    "manifest lists '{filename}' twice with different hashes — refusing to guess"
                )));
            }
            Some(_) => {}
            None => found = Some(hash),
        }
    }

    found.ok_or_else(|| {
        AppError::verification(format!("no SHA-256 entry for '{filename}' in the manifest"))
    })
}

fn split_entry(line: &str, format: ManifestFormat) -> Option<(&str, &str)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    match format {
        ManifestFormat::Sha256Sums => line.split_once("  "),
        ManifestFormat::Whitespace => line.split_once(char::is_whitespace),
    }
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit())
}

/// Hash a downloaded file and compare it to the manifest.
///
/// On mismatch the file is deleted before returning. Leaving a
/// failed-verification artifact on disk invites a later code path — or a
/// user — to run it.
pub async fn verify_download(path: &Path, expected: &str, cache: &ProbeCache) -> AppResult<String> {
    let computed = file_sha256(path, cache)
        .await
        .map_err(|error| AppError::verification(format!("SHA-256 computation failed: {error}")))?;

    if !computed.eq_ignore_ascii_case(expected) {
        let _ = tokio::fs::remove_file(path).await;
        return Err(AppError::verification(format!(
            "SHA-256 mismatch — the download is corrupted or has been tampered with.\nExpected: {expected}\nGot:      {computed}"
        )));
    }

    Ok(computed)
}

pub fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASH_A: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const HASH_B: &str = "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae";

    #[test]
    fn reads_a_sha256sums_manifest() {
        let text = format!("{HASH_A}  yt-dlp.exe\n{HASH_B}  yt-dlp_linux\n");
        let hash = parse_manifest(&text, ManifestFormat::Sha256Sums, "yt-dlp.exe").unwrap();
        assert_eq!(hash, HASH_A);
    }

    #[test]
    fn reads_a_whitespace_manifest() {
        let text = format!("{HASH_A} ffmpeg-master-latest-win64-gpl.zip\n");
        let hash = parse_manifest(
            &text,
            ManifestFormat::Whitespace,
            "ffmpeg-master-latest-win64-gpl.zip",
        )
        .unwrap();
        assert_eq!(hash, HASH_A);
    }

    #[test]
    fn tolerates_the_binary_mode_star() {
        let text = format!("{HASH_A}  *yt-dlp.exe\n");
        assert_eq!(
            parse_manifest(&text, ManifestFormat::Sha256Sums, "yt-dlp.exe").unwrap(),
            HASH_A
        );
    }

    #[test]
    fn a_contradictory_manifest_is_refused_not_resolved() {
        let text = format!("{HASH_A}  yt-dlp.exe\n{HASH_B}  yt-dlp.exe\n");
        let error = parse_manifest(&text, ManifestFormat::Sha256Sums, "yt-dlp.exe").unwrap_err();
        assert!(error.to_string().contains("twice"));
    }

    #[test]
    fn a_repeated_but_agreeing_entry_is_fine() {
        let text = format!("{HASH_A}  yt-dlp.exe\n{HASH_A}  yt-dlp.exe\n");
        assert_eq!(
            parse_manifest(&text, ManifestFormat::Sha256Sums, "yt-dlp.exe").unwrap(),
            HASH_A
        );
    }

    #[test]
    fn an_html_error_page_does_not_parse_as_a_hash() {
        // A 404 body reaching the parser must fail here, with a message about
        // the manifest — not later, as a confusing hash mismatch.
        let text = "<!DOCTYPE html>\n<html>  yt-dlp.exe</html>";
        assert!(parse_manifest(text, ManifestFormat::Sha256Sums, "yt-dlp.exe").is_err());
    }

    #[test]
    fn a_truncated_hash_is_rejected() {
        let text = "deadbeef  yt-dlp.exe";
        assert!(parse_manifest(text, ManifestFormat::Sha256Sums, "yt-dlp.exe").is_err());
    }

    #[test]
    fn a_missing_entry_names_the_file_it_looked_for() {
        let text = format!("{HASH_A}  something-else\n");
        let error = parse_manifest(&text, ManifestFormat::Sha256Sums, "yt-dlp.exe").unwrap_err();
        assert!(error.to_string().contains("yt-dlp.exe"));
    }

    #[test]
    fn comments_and_blank_lines_are_skipped() {
        let text = format!("# checksums\n\n{HASH_A}  yt-dlp.exe\n");
        assert_eq!(
            parse_manifest(&text, ManifestFormat::Sha256Sums, "yt-dlp.exe").unwrap(),
            HASH_A
        );
    }

    #[test]
    fn journal_reinstall_of_the_same_build_is_not_a_change() {
        let mut journal = ArtifactJournal::default();
        assert!(!journal.record("yt-dlp.exe", HASH_A, 100));
        assert!(!journal.record("yt-dlp.exe", HASH_A, 200));

        let entry = &journal.entries["yt-dlp.exe"];
        assert_eq!(entry.first_seen, 100);
        assert_eq!(entry.last_seen, 200);
        assert_eq!(entry.revision, 1);
    }

    #[test]
    fn journal_counts_a_new_upstream_build_as_a_revision() {
        let mut journal = ArtifactJournal::default();
        journal.record("yt-dlp.exe", HASH_A, 100);
        assert!(journal.record("yt-dlp.exe", HASH_B, 300));

        let entry = &journal.entries["yt-dlp.exe"];
        assert_eq!(entry.sha256, HASH_B);
        assert_eq!(entry.first_seen, 300);
        assert_eq!(entry.revision, 2);
    }

    #[tokio::test]
    async fn a_mismatched_download_is_deleted() {
        let dir = std::env::temp_dir().join(format!("theatlas-verify-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("artifact.bin");
        std::fs::write(&file, b"abc").unwrap();

        let cache = ProbeCache::new();
        assert!(verify_download(&file, HASH_B, &cache).await.is_err());
        assert!(!file.exists(), "a failed artifact must not stay on disk");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_matching_download_survives_and_returns_its_hash() {
        let dir = std::env::temp_dir().join(format!("theatlas-verify-ok-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("artifact.bin");
        std::fs::write(&file, b"abc").unwrap();

        let cache = ProbeCache::new();
        assert_eq!(
            verify_download(&file, HASH_A, &cache).await.unwrap(),
            HASH_A
        );
        assert!(file.exists());

        std::fs::remove_dir_all(&dir).ok();
    }
}
