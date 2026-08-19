//! Fetching an artifact, with throttled progress.
//!
//! The progress sink is a closure, not an `AppHandle`. That is what keeps this
//! module testable and what lets the command layer decide *how* progress is
//! published — today one `install-progress` event, tomorrow a scoped
//! `progress:{job_id}` one — without touching the download loop.

use std::path::Path;
use std::time::{Duration, Instant};

use tokio::io::AsyncWriteExt;

use crate::error::{AppError, AppResult};

/// A progress tick worth showing a person.
#[derive(Debug, Clone, Copy)]
pub struct DownloadProgress {
    pub downloaded: u64,
    /// `None` when the server sent no `Content-Length`.
    pub total: Option<u64>,
    /// 0–100. Stays at 0 for a download of unknown length.
    pub percent: f64,
    /// Bytes per second over the last emitted interval, not the whole
    /// transfer — an average over the whole transfer keeps showing the speed
    /// of a stall long after it has recovered.
    pub speed_bps: f64,
}

/// Decides which ticks are worth emitting.
///
/// Split out from the loop and given an explicit `now` so the policy can be
/// tested without sleeping: the rule is "at most once per interval, but always
/// on a full percentage point", and getting that backwards floods the IPC
/// channel on a fast connection.
#[derive(Debug)]
pub struct ProgressThrottle {
    min_interval: Duration,
    min_percent_delta: f64,
    last_emit_at: Instant,
    last_percent: f64,
    bytes_at_last_emit: u64,
}

impl ProgressThrottle {
    pub fn new(now: Instant) -> Self {
        Self {
            min_interval: Duration::from_millis(250),
            min_percent_delta: 1.0,
            last_emit_at: now,
            last_percent: -1.0,
            bytes_at_last_emit: 0,
        }
    }

    /// Returns the speed to report when this tick should be emitted.
    pub fn tick(&mut self, downloaded: u64, percent: f64, now: Instant) -> Option<f64> {
        let elapsed = now.saturating_duration_since(self.last_emit_at);
        let floored = (percent * 10.0).floor() / 10.0;

        let due = elapsed >= self.min_interval
            || (floored - self.last_percent).abs() >= self.min_percent_delta;
        if !due {
            return None;
        }

        // Clamped so a same-instant tick cannot divide by zero and report an
        // infinite speed.
        let seconds = elapsed.as_secs_f64().max(0.001);
        let speed = downloaded.saturating_sub(self.bytes_at_last_emit) as f64 / seconds;

        self.last_percent = floored;
        self.bytes_at_last_emit = downloaded;
        self.last_emit_at = now;

        Some(speed)
    }
}

/// Download `url` to `dest`, reporting progress through `on_progress`.
///
/// The body is streamed to disk chunk by chunk rather than buffered — an
/// ffmpeg build is well over 100 MB and holding it in memory to write it once
/// is a pointless spike.
pub async fn download_to_file<F>(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    mut on_progress: F,
) -> AppResult<u64>
where
    F: FnMut(DownloadProgress),
{
    let response = client.get(url).send().await?;

    if !response.status().is_success() {
        return Err(AppError::network(format!(
            "HTTP {} while downloading",
            response.status()
        )));
    }

    let total = response.content_length().filter(|len| *len > 0);
    let mut file = tokio::fs::File::create(dest).await?;
    let mut throttle = ProgressThrottle::new(Instant::now());
    let mut downloaded: u64 = 0;
    let mut response = response;

    while let Some(chunk) = response.chunk().await? {
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        let percent = match total {
            Some(total) => (downloaded as f64 / total as f64) * 100.0,
            None => 0.0,
        };

        if let Some(speed_bps) = throttle.tick(downloaded, percent, Instant::now()) {
            on_progress(DownloadProgress {
                downloaded,
                total,
                percent,
                speed_bps,
            });
        }
    }

    file.flush().await?;

    // The throttle can swallow the last chunk; a progress bar that stops at
    // 98% and jumps to "Extracting" reads as a glitch.
    on_progress(DownloadProgress {
        downloaded,
        total,
        percent: 100.0,
        speed_bps: 0.0,
    });

    Ok(downloaded)
}

/// Fetch a text manifest.
pub async fn fetch_text(client: &reqwest::Client, url: &str) -> AppResult<String> {
    let response = client.get(url).send().await?;

    if !response.status().is_success() {
        return Err(AppError::network(format!(
            "HTTP {} while fetching the manifest",
            response.status()
        )));
    }

    Ok(response.text().await?)
}

/// Total size of what `url` would download, without downloading it.
///
/// A one-byte ranged GET rather than a HEAD: GitHub's release redirects to a
/// storage host that answers HEAD inconsistently, but always honours `Range`
/// and reports the full length in `Content-Range`.
pub async fn probe_content_length(client: &reqwest::Client, url: &str) -> AppResult<u64> {
    let response = client
        .get(url)
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
        .await?;

    if let Some(range) = response.headers().get(reqwest::header::CONTENT_RANGE) {
        if let Some(total) = range
            .to_str()
            .ok()
            .and_then(|value| value.rsplit('/').next())
            .and_then(|value| value.trim().parse::<u64>().ok())
        {
            return Ok(total);
        }
    }

    Ok(response.content_length().unwrap_or(0))
}

/// Format a byte rate the way the install dialog shows it.
pub fn format_speed(bytes_per_second: f64) -> String {
    if bytes_per_second >= 1_048_576.0 {
        format!("{:.1} MB/s", bytes_per_second / 1_048_576.0)
    } else if bytes_per_second >= 1024.0 {
        format!("{:.0} KB/s", bytes_per_second / 1024.0)
    } else {
        "< 1 KB/s".to_string()
    }
}

/// The one HTTP client for the whole process.
///
/// `reqwest::Client` pools connections internally; the old code built a fresh
/// one per install and per size probe, throwing away keep-alive and repeating
/// TLS setup every time. Built once in `state.rs` and shared.
pub fn build_client(user_agent: &str) -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(user_agent.to_string())
        .redirect(reqwest::redirect::Policy::limited(10))
        // Applies to the whole request, so it cannot bound a large download —
        // that is what `connect_timeout` and the read timeout below are for.
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| AppError::network(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_tick_always_emits() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new(start);
        assert!(throttle.tick(1024, 0.5, start).is_some());
    }

    #[test]
    fn a_tick_below_both_thresholds_is_dropped() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new(start);
        throttle.tick(1024, 10.0, start);

        let soon = start + Duration::from_millis(50);
        assert!(throttle.tick(1030, 10.05, soon).is_none());
    }

    #[test]
    fn a_full_percent_jump_emits_even_inside_the_interval() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new(start);
        throttle.tick(1024, 10.0, start);

        let soon = start + Duration::from_millis(20);
        assert!(throttle.tick(200_000, 11.5, soon).is_some());
    }

    #[test]
    fn the_interval_emits_even_without_percent_movement() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new(start);
        throttle.tick(1024, 10.0, start);

        let later = start + Duration::from_millis(300);
        assert!(throttle.tick(1030, 10.0, later).is_some());
    }

    #[test]
    fn speed_is_measured_over_the_last_interval_not_the_whole_transfer() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new(start);
        throttle.tick(1_000_000, 10.0, start);

        let later = start + Duration::from_secs(1);
        let speed = throttle.tick(2_000_000, 20.0, later).unwrap();
        assert!((speed - 1_000_000.0).abs() < 1.0, "got {speed}");
    }

    #[test]
    fn a_same_instant_tick_does_not_report_an_infinite_speed() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new(start);
        throttle.tick(0, 0.0, start);

        let speed = throttle.tick(1_000, 5.0, start).unwrap();
        assert!(speed.is_finite(), "got {speed}");
    }

    #[test]
    fn speed_formatting_covers_all_three_bands() {
        assert_eq!(format_speed(5.0 * 1_048_576.0), "5.0 MB/s");
        assert_eq!(format_speed(2048.0), "2 KB/s");
        assert_eq!(format_speed(12.0), "< 1 KB/s");
    }

    #[test]
    fn the_shared_client_builds() {
        assert!(build_client("TheAtlas-Media/test").is_ok());
    }
}
