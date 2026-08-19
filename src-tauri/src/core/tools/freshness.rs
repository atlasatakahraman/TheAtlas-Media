//! Deciding whether a managed tool is out of date.
//!
//! Two upstreams, two different answers to "what version is this?", so two
//! rules:
//!
//! - **yt-dlp** tags every release (`2025.08.11`), so a tag comparison works.
//! - **BtbN's FFmpeg builds** publish under a rolling tag whose literal name is
//!   `latest`. Comparing that to anything is meaningless, so freshness is the
//!   release's `published_at` against the managed binary's mtime instead.
//!
//! Both rules only ever fire for a tool resolved from the managed directory.
//! A copy the app did not install is never claimed stale: the app has no idea
//! how the user maintains it and no business offering to overwrite it.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::probe::normalize_version_for_compare;
use super::types::{DependencyInfo, DependencySource};

/// What the last upstream check found, persisted between launches.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateCache {
    pub last_check_timestamp: u64,
    pub ytdlp_tag: Option<String>,
    pub ffmpeg_tag: Option<String>,
    /// Unix seconds when the latest BtbN FFmpeg release was published.
    pub ffmpeg_published_at: Option<u64>,
}

/// A managed probe result: where the binary is, what it reports, when it was
/// written.
pub type ManagedProbe = (PathBuf, String, SystemTime);

/// Tag-comparison freshness, for an upstream that publishes real tags.
pub fn apply_tag_freshness(info: &mut DependencyInfo, latest_tag: Option<&str>) {
    if info.source != DependencySource::Managed {
        return;
    }

    let Some(tag) = latest_tag else { return };
    if tag.is_empty() || tag.eq_ignore_ascii_case("latest") {
        return;
    }

    info.latest_version = Some(tag.to_string());

    if let Some(current) = &info.version {
        info.update_available =
            normalize_version_for_compare(current) != normalize_version_for_compare(tag);
    }
}

/// Timestamp-comparison freshness, for an upstream with a rolling tag.
pub fn apply_publish_freshness(
    info: &mut DependencyInfo,
    published_at: Option<u64>,
    probe: Option<&ManagedProbe>,
) {
    if info.source != DependencySource::Managed {
        return;
    }

    let (Some(published_at), Some((_, _, mtime))) = (published_at, probe) else {
        return;
    };

    let Ok(mtime_secs) = mtime.duration_since(UNIX_EPOCH).map(|d| d.as_secs()) else {
        return;
    };

    info.update_available = published_at > mtime_secs;
    info.latest_version = Some("Latest Release".to_string());
}

/// Parse GitHub's fixed-width RFC-3339 UTC timestamp (`YYYY-MM-DDTHH:MM:SSZ`)
/// into unix seconds.
///
/// A date library for one field of one API response is not worth the
/// dependency, and the GitHub API always emits exactly this form.
pub fn parse_rfc3339_to_unix_secs(text: &str) -> Option<u64> {
    let bytes = text.as_bytes();
    if bytes.len() < 20 || bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' {
        return None;
    }

    let year: i64 = text.get(0..4)?.parse().ok()?;
    let month: i64 = text.get(5..7)?.parse().ok()?;
    let day: i64 = text.get(8..10)?.parse().ok()?;
    let hour: i64 = text.get(11..13)?.parse().ok()?;
    let minute: i64 = text.get(14..16)?.parse().ok()?;
    let second: i64 = text.get(17..19)?.parse().ok()?;

    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 60
    {
        return None;
    }

    let total = days_from_civil(year, month, day) * 86_400 + hour * 3_600 + minute * 60 + second;
    u64::try_from(total).ok()
}

/// Howard Hinnant's `days_from_civil`: days since the Unix epoch, no lookup
/// tables and no leap-year special cases.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

pub fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::tools::types::{DependencyInfo, DependencyStatus};
    use std::time::Duration;

    fn managed(version: &str) -> DependencyInfo {
        DependencyInfo {
            name: "ytdlp".into(),
            status: DependencyStatus::Installed,
            source: DependencySource::Managed,
            path: Some("/managed/yt-dlp".into()),
            version: Some(version.into()),
            latest_version: None,
            size_mb: None,
            size_bytes: None,
            sha256: None,
            error: None,
            managed_installed: true,
            managed_version: Some(version.into()),
            managed_path: Some("/managed/yt-dlp".into()),
            update_available: false,
        }
    }

    #[test]
    fn a_newer_tag_marks_an_update_available() {
        let mut info = managed("2025.01.01");
        apply_tag_freshness(&mut info, Some("2025.08.11"));

        assert!(info.update_available);
        assert_eq!(info.latest_version.as_deref(), Some("2025.08.11"));
    }

    #[test]
    fn the_same_tag_is_not_an_update() {
        let mut info = managed("2025.08.11");
        apply_tag_freshness(&mut info, Some("2025.08.11"));
        assert!(!info.update_available);
    }

    #[test]
    fn tag_comparison_ignores_a_v_prefix_on_one_side() {
        let mut info = managed("7.1");
        apply_tag_freshness(&mut info, Some("v7.1"));
        assert!(!info.update_available, "v7.1 and 7.1 are the same release");
    }

    #[test]
    fn an_external_install_is_never_claimed_stale() {
        let mut info = managed("2020.01.01");
        info.source = DependencySource::Path;
        apply_tag_freshness(&mut info, Some("2025.08.11"));

        assert!(!info.update_available);
        assert_eq!(info.latest_version, None);
    }

    #[test]
    fn the_literal_latest_tag_is_not_treated_as_a_version() {
        let mut info = managed("n7.1");
        apply_tag_freshness(&mut info, Some("latest"));

        assert!(!info.update_available);
        assert_eq!(info.latest_version, None);
    }

    #[test]
    fn a_release_published_after_the_binary_is_an_update() {
        let mtime = UNIX_EPOCH + Duration::from_secs(1_000);
        let probe = (PathBuf::from("/managed/ffmpeg"), "n7.1".to_string(), mtime);

        let mut info = managed("n7.1");
        apply_publish_freshness(&mut info, Some(2_000), Some(&probe));

        assert!(info.update_available);
        assert_eq!(info.latest_version.as_deref(), Some("Latest Release"));
    }

    #[test]
    fn a_binary_newer_than_the_release_is_current() {
        let mtime = UNIX_EPOCH + Duration::from_secs(3_000);
        let probe = (PathBuf::from("/managed/ffmpeg"), "n7.1".to_string(), mtime);

        let mut info = managed("n7.1");
        apply_publish_freshness(&mut info, Some(2_000), Some(&probe));

        assert!(!info.update_available);
    }

    #[test]
    fn no_probe_means_no_claim_either_way() {
        let mut info = managed("n7.1");
        apply_publish_freshness(&mut info, Some(2_000), None);
        assert!(!info.update_available);
    }

    #[test]
    fn parses_a_github_timestamp() {
        assert_eq!(parse_rfc3339_to_unix_secs("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_rfc3339_to_unix_secs("2000-01-01T00:00:00Z"),
            Some(946_684_800)
        );
        assert_eq!(
            parse_rfc3339_to_unix_secs("2024-02-29T12:00:00Z"),
            Some(1_709_208_000)
        );
    }

    #[test]
    fn rejects_malformed_timestamps() {
        for bad in [
            "",
            "not a date",
            "2024-13-01T00:00:00Z",
            "2024-01-32T00:00:00Z",
            "2024-01-01T25:00:00Z",
            "2024/01/01T00:00:00Z",
            "2024-01-01",
        ] {
            assert_eq!(parse_rfc3339_to_unix_secs(bad), None, "accepted {bad:?}");
        }
    }

    #[test]
    fn a_pre_epoch_timestamp_is_rejected_rather_than_wrapped() {
        // `u64::try_from` on a negative second count must fail, not wrap to a
        // date far in the future that would suppress every update forever.
        assert_eq!(parse_rfc3339_to_unix_secs("1969-12-31T00:00:00Z"), None);
    }
}
