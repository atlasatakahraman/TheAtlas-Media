//! The shapes that cross IPC for the media job engine.
//!
//! Mirrored by hand in `src/lib/types.ts` — there is no codegen, so a change
//! here is only half a change. Every struct is `rename_all = "camelCase"`, and
//! `Option<T>` becomes `T | null` on the other side. Follows the same
//! convention as `core::tools::types`.

use serde::{Deserialize, Serialize};

pub type JobId = u64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobKind {
    Download,
    Convert,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Queued,
    Running,
    Finalizing,
    Completed,
    Failed,
    Cancelled,
}

/// A progress tick worth showing a person. `percent: None` means "render
/// indeterminate" — either the phase genuinely has no notion of a percentage
/// (finalizing), or the total size is not known yet.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobProgress {
    pub percent: Option<f64>,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub speed_bps: Option<f64>,
    pub eta_secs: Option<u64>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSnapshot {
    pub id: JobId,
    pub kind: JobKind,
    pub status: JobStatus,
    pub title: String,
    pub progress: JobProgress,
    pub output_path: Option<String>,
    pub error: Option<String>,
    pub queued_at: u64,
    pub started_at: Option<u64>,
    pub finished_at: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSpec {
    pub url: String,
    /// Already known from `probe_media_url`'s answer — carried here instead
    /// of re-probed, which would spend a second yt-dlp round trip on
    /// something the caller already has.
    pub title: String,
    /// yt-dlp `-f` value. `None` falls back to `"bv*+ba/b"`.
    pub format_id: Option<String>,
    pub audio_only: bool,
    pub output_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertSpec {
    pub input_path: String,
    pub output_dir: String,
    /// "mp4" | "mkv" | "webm".
    pub container: String,
    /// `None` means `-c:v copy`.
    pub video_codec: Option<String>,
    /// `None` means `-c:a copy`.
    pub audio_codec: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoFormat {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize_bytes: Option<u64>,
    pub tbr_kbps: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub id: String,
    pub title: String,
    pub duration_secs: Option<f64>,
    pub thumbnail_url: Option<String>,
    pub uploader: Option<String>,
    pub formats: Vec<VideoFormat>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaProbe {
    pub duration_secs: Option<f64>,
    pub container: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}
