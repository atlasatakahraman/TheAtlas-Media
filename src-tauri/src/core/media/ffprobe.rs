//! ffprobe argument building and JSON parsing. Pure functions, no I/O.

use std::path::Path;

use serde::Deserialize;

use super::types::MediaProbe;
use crate::error::{AppError, AppResult};

pub fn build_probe_args(path: &Path) -> Vec<String> {
    vec![
        "-v".to_string(),
        "quiet".to_string(),
        "-print_format".to_string(),
        "json".to_string(),
        "-show_format".to_string(),
        "-show_streams".to_string(),
        path.to_string_lossy().to_string(),
    ]
}

#[derive(Debug, Deserialize, Default)]
struct FfprobeJson {
    #[serde(default)]
    format: FormatJson,
    #[serde(default)]
    streams: Vec<StreamJson>,
}

#[derive(Debug, Deserialize, Default)]
struct FormatJson {
    #[serde(default)]
    duration: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct StreamJson {
    #[serde(default)]
    codec_type: String,
    #[serde(default)]
    codec_name: Option<String>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
}

pub fn parse_probe_json(raw: &str, path: &Path) -> AppResult<MediaProbe> {
    let parsed: FfprobeJson = serde_json::from_str(raw).map_err(|error| {
        AppError::subprocess(format!("could not parse ffprobe output: {error}"))
    })?;

    let duration_secs = parsed.format.duration.and_then(|s| s.parse().ok());

    let video = parsed.streams.iter().find(|s| s.codec_type == "video");
    let audio = parsed.streams.iter().find(|s| s.codec_type == "audio");

    Ok(MediaProbe {
        duration_secs,
        container: path
            .extension()
            .map(|ext| ext.to_string_lossy().to_lowercase()),
        video_codec: video.and_then(|s| s.codec_name.clone()),
        audio_codec: audio.and_then(|s| s.codec_name.clone()),
        width: video.and_then(|s| s.width),
        height: video.and_then(|s| s.height),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"{
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1920,
                "height": 1080
            },
            {
                "codec_type": "audio",
                "codec_name": "aac"
            }
        ],
        "format": {
            "duration": "125.500000"
        }
    }"#;

    #[test]
    fn parses_duration_and_streams() {
        let probe =
            parse_probe_json(FIXTURE, Path::new("C:\\in\\video.mp4")).expect("should parse");
        assert_eq!(probe.duration_secs, Some(125.5));
        assert_eq!(probe.video_codec, Some("h264".to_string()));
        assert_eq!(probe.audio_codec, Some("aac".to_string()));
        assert_eq!(probe.width, Some(1920));
        assert_eq!(probe.height, Some(1080));
        assert_eq!(probe.container, Some("mp4".to_string()));
    }

    #[test]
    fn missing_streams_default_to_none() {
        let probe = parse_probe_json(r#"{"format": {}}"#, Path::new("C:\\in\\video"))
            .expect("should parse");
        assert_eq!(probe.duration_secs, None);
        assert_eq!(probe.video_codec, None);
        assert_eq!(probe.container, None);
    }

    #[test]
    fn builds_exact_probe_args() {
        let args = build_probe_args(Path::new("C:\\in\\video.mp4"));
        assert_eq!(
            args,
            vec![
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                "C:\\in\\video.mp4",
            ]
        );
    }
}
