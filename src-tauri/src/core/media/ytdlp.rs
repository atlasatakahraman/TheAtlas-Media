//! yt-dlp argument building and output parsing. Pure functions, no I/O — the
//! subprocess itself is spawned by `engine::run_job` through `spawn.rs`.
//!
//! Progress and the final output path are pulled out of yt-dlp's stdout via
//! two sentinel-prefixed lines rather than regexing the human-readable
//! `[download] 42.1% of ...` text, which changes wording between releases.

use std::path::Path;

use serde::Deserialize;

use super::types::{DownloadSpec, VideoFormat, VideoMetadata};
use crate::error::{AppError, AppResult};

const PROGRESS_SENTINEL: &str = "TAMPROG|";
const FINAL_PATH_SENTINEL: &str = "TAMFINAL|";

/// One parsed `TAMPROG|` line.
#[derive(Debug, Clone, PartialEq)]
pub struct YtDlpTick {
    pub status: String,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub speed_bps: Option<f64>,
    pub eta_secs: Option<u64>,
}

/// `None` for any line that is not a `TAMPROG|` progress line. yt-dlp prints
/// the literal string `"NA"` for a field it does not know yet; `"NA".parse()`
/// correctly yields `None` for every numeric field here, so no special case
/// is needed for it.
pub fn parse_progress_line(line: &str) -> Option<YtDlpTick> {
    let rest = line.strip_prefix(PROGRESS_SENTINEL)?;
    let mut fields = rest.split('|');
    let status = fields.next()?.to_string();
    let downloaded_bytes = fields.next().and_then(|f| f.parse().ok());
    let total_bytes = fields.next().and_then(|f| f.parse().ok());
    let speed_bps = fields.next().and_then(|f| f.parse().ok());
    let eta_secs = fields.next().and_then(|f| f.parse().ok());

    Some(YtDlpTick {
        status,
        downloaded_bytes,
        total_bytes,
        speed_bps,
        eta_secs,
    })
}

/// `None` for any line that is not a `TAMFINAL|` line.
pub fn parse_final_path(line: &str) -> Option<&str> {
    line.strip_prefix(FINAL_PATH_SENTINEL)
}

/// Build the argument vector for a download job.
///
/// `ffmpeg_dir` is ffmpeg's *containing* directory — yt-dlp needs it to merge
/// separate video/audio streams even when ffmpeg is only managed-installed
/// and not on `PATH`.
pub fn build_download_args(spec: &DownloadSpec, ffmpeg_dir: &Path) -> Vec<String> {
    let mut args = vec![
        "--newline".to_string(),
        "--no-color".to_string(),
        "--no-playlist".to_string(),
        "--ffmpeg-location".to_string(),
        ffmpeg_dir.to_string_lossy().to_string(),
        "--progress-template".to_string(),
        format!(
            "download:{PROGRESS_SENTINEL}%(progress.status)s|%(progress.downloaded_bytes)s|\
             %(progress.total_bytes,progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s"
        ),
        "--print".to_string(),
        format!("after_move:{FINAL_PATH_SENTINEL}%(filepath)s"),
        "-f".to_string(),
        spec.format_id.clone().unwrap_or_else(|| "bv*+ba/b".to_string()),
    ];

    if spec.audio_only {
        args.push("-x".to_string());
    }

    args.extend([
        "-o".to_string(),
        "%(title)s [%(id)s].%(ext)s".to_string(),
        "-P".to_string(),
        spec.output_dir.clone(),
        "--retries".to_string(),
        "3".to_string(),
        spec.url.clone(),
    ]);

    args
}

pub fn build_probe_args(url: &str) -> Vec<String> {
    vec![
        "--dump-single-json".to_string(),
        "--no-playlist".to_string(),
        "--no-warnings".to_string(),
        url.to_string(),
    ]
}

/// yt-dlp's `--dump-single-json` schema, per its public documentation — not
/// something this repo can read directly, since yt-dlp is an external managed
/// binary. Every optional field defaults on a missing/renamed key rather than
/// failing the whole parse.
#[derive(Debug, Deserialize, Default)]
struct YtDlpDumpJson {
    id: String,
    title: String,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
    #[serde(default)]
    formats: Vec<YtDlpFormatJson>,
}

#[derive(Debug, Deserialize, Default)]
struct YtDlpFormatJson {
    format_id: String,
    #[serde(default)]
    ext: String,
    #[serde(default)]
    resolution: Option<String>,
    #[serde(default)]
    fps: Option<f64>,
    #[serde(default)]
    vcodec: Option<String>,
    #[serde(default)]
    acodec: Option<String>,
    #[serde(default)]
    filesize: Option<u64>,
    #[serde(default)]
    filesize_approx: Option<u64>,
    #[serde(default)]
    tbr: Option<f64>,
}

pub fn parse_metadata_json(raw: &str) -> AppResult<VideoMetadata> {
    let parsed: YtDlpDumpJson = serde_json::from_str(raw).map_err(|error| {
        AppError::subprocess(format!("could not parse yt-dlp metadata: {error}"))
    })?;

    Ok(VideoMetadata {
        id: parsed.id,
        title: parsed.title,
        duration_secs: parsed.duration,
        thumbnail_url: parsed.thumbnail,
        uploader: parsed.uploader,
        formats: parsed
            .formats
            .into_iter()
            .map(|format| VideoFormat {
                format_id: format.format_id,
                ext: format.ext,
                resolution: format.resolution,
                fps: format.fps,
                vcodec: format.vcodec,
                acodec: format.acodec,
                filesize_bytes: format.filesize.or(format.filesize_approx),
                tbr_kbps: format.tbr,
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_full_progress_line() {
        let tick = parse_progress_line("TAMPROG|downloading|1048576|10485760|524288.5|18")
            .expect("should parse");
        assert_eq!(tick.status, "downloading");
        assert_eq!(tick.downloaded_bytes, Some(1_048_576));
        assert_eq!(tick.total_bytes, Some(10_485_760));
        assert_eq!(tick.speed_bps, Some(524_288.5));
        assert_eq!(tick.eta_secs, Some(18));
    }

    #[test]
    fn na_fields_become_none() {
        let tick = parse_progress_line("TAMPROG|downloading|NA|NA|NA|NA").expect("should parse");
        assert_eq!(tick.downloaded_bytes, None);
        assert_eq!(tick.total_bytes, None);
        assert_eq!(tick.speed_bps, None);
        assert_eq!(tick.eta_secs, None);
    }

    #[test]
    fn ignores_unrelated_lines() {
        assert_eq!(parse_progress_line("[download] Destination: foo.mp4"), None);
    }

    #[test]
    fn parses_the_final_path_line() {
        assert_eq!(
            parse_final_path("TAMFINAL|C:\\Users\\me\\Downloads\\video.mp4"),
            Some("C:\\Users\\me\\Downloads\\video.mp4")
        );
        assert_eq!(parse_final_path("something else"), None);
    }

    #[test]
    fn builds_exact_download_args() {
        let spec = DownloadSpec {
            url: "https://example.com/watch?v=abc".to_string(),
            title: "Example Video".to_string(),
            format_id: Some("137+140".to_string()),
            audio_only: false,
            output_dir: "C:\\out".to_string(),
        };
        let args = build_download_args(&spec, Path::new("C:\\tools\\ffmpeg"));

        assert_eq!(
            args,
            vec![
                "--newline",
                "--no-color",
                "--no-playlist",
                "--ffmpeg-location",
                "C:\\tools\\ffmpeg",
                "--progress-template",
                "download:TAMPROG|%(progress.status)s|%(progress.downloaded_bytes)s|\
                 %(progress.total_bytes,progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
                "--print",
                "after_move:TAMFINAL|%(filepath)s",
                "-f",
                "137+140",
                "-o",
                "%(title)s [%(id)s].%(ext)s",
                "-P",
                "C:\\out",
                "--retries",
                "3",
                "https://example.com/watch?v=abc",
            ]
        );
    }

    #[test]
    fn audio_only_inserts_extract_flag_before_output_args() {
        let spec = DownloadSpec {
            url: "https://example.com/watch?v=abc".to_string(),
            title: "Example Video".to_string(),
            format_id: None,
            audio_only: true,
            output_dir: "C:\\out".to_string(),
        };
        let args = build_download_args(&spec, Path::new("C:\\tools\\ffmpeg"));

        let f_index = args.iter().position(|a| a == "-f").unwrap();
        assert_eq!(args[f_index + 1], "bv*+ba/b");
        assert!(args.contains(&"-x".to_string()));
        let x_index = args.iter().position(|a| a == "-x").unwrap();
        let o_index = args.iter().position(|a| a == "-o").unwrap();
        assert!(x_index < o_index);
    }

    #[test]
    fn parses_metadata_json_with_formats() {
        let raw = r#"{
            "id": "abc123",
            "title": "Example Video",
            "duration": 125.5,
            "thumbnail": "https://example.com/thumb.jpg",
            "uploader": "Example Channel",
            "formats": [
                {
                    "format_id": "137",
                    "ext": "mp4",
                    "resolution": "1920x1080",
                    "fps": 30.0,
                    "vcodec": "avc1",
                    "acodec": "none",
                    "filesize": 12345678,
                    "tbr": 1500.0
                }
            ]
        }"#;

        let metadata = parse_metadata_json(raw).expect("should parse");
        assert_eq!(metadata.id, "abc123");
        assert_eq!(metadata.title, "Example Video");
        assert_eq!(metadata.duration_secs, Some(125.5));
        assert_eq!(metadata.formats.len(), 1);
        assert_eq!(metadata.formats[0].filesize_bytes, Some(12_345_678));
    }

    #[test]
    fn missing_optional_fields_default_instead_of_failing() {
        let raw = r#"{"id": "abc", "title": "Bare"}"#;
        let metadata = parse_metadata_json(raw).expect("should parse with only required fields");
        assert_eq!(metadata.duration_secs, None);
        assert!(metadata.formats.is_empty());
    }
}
