//! ffmpeg argument building and `-progress pipe:1` parsing. Pure functions,
//! no I/O — the subprocess itself is spawned by `engine::run_job`.

use std::path::Path;

use super::types::ConvertSpec;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgressState {
    Continue,
    End,
}

/// One accumulated `-progress pipe:1` block — every `key=value` line between
/// two `progress=` markers.
#[derive(Debug, Clone, Default)]
pub struct FfmpegTick {
    /// Despite the name, ffmpeg's `out_time_us` key is microseconds, not
    /// milliseconds — a documented quirk of the `-progress` output.
    pub out_time_us: Option<i64>,
    pub speed: Option<f64>,
    pub progress: Option<ProgressState>,
}

/// Parse one block of `key=value` lines (the lines seen since the previous
/// `progress=` marker, that marker included as the last line).
pub fn parse_progress_block(lines: &[&str]) -> FfmpegTick {
    let mut tick = FfmpegTick::default();

    for line in lines {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = value.trim();

        match key.trim() {
            "out_time_us" => tick.out_time_us = value.parse().ok(),
            "speed" => tick.speed = value.trim_end_matches('x').trim().parse().ok(),
            "progress" => {
                tick.progress = match value {
                    "continue" => Some(ProgressState::Continue),
                    "end" => Some(ProgressState::End),
                    _ => None,
                }
            }
            _ => {}
        }
    }

    tick
}

/// Percentage of `duration_secs` reached, clamped to `0.0..=100.0`. `None`
/// when the tick has no `out_time_us` yet, or the duration is unknown or
/// non-positive.
pub fn percent_from(tick: &FfmpegTick, duration_secs: f64) -> Option<f64> {
    if duration_secs <= 0.0 {
        return None;
    }
    tick.out_time_us.map(|us| {
        let elapsed_secs = (us as f64 / 1_000_000.0).max(0.0);
        ((elapsed_secs / duration_secs) * 100.0).clamp(0.0, 100.0)
    })
}

pub fn build_transcode_args(spec: &ConvertSpec, output_path: &Path) -> Vec<String> {
    vec![
        "-y".to_string(),
        "-i".to_string(),
        spec.input_path.clone(),
        "-c:v".to_string(),
        spec.video_codec
            .clone()
            .unwrap_or_else(|| "copy".to_string()),
        "-c:a".to_string(),
        spec.audio_codec
            .clone()
            .unwrap_or_else(|| "copy".to_string()),
        "-progress".to_string(),
        "pipe:1".to_string(),
        "-nostats".to_string(),
        output_path.to_string_lossy().to_string(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_continue_block() {
        let tick = parse_progress_block(&[
            "frame=120",
            "fps=30.0",
            "out_time_us=4000000",
            "speed=2.50x",
            "progress=continue",
        ]);
        assert_eq!(tick.out_time_us, Some(4_000_000));
        assert_eq!(tick.speed, Some(2.5));
        assert_eq!(tick.progress, Some(ProgressState::Continue));
    }

    #[test]
    fn parses_an_end_block() {
        let tick = parse_progress_block(&["out_time_us=8000000", "speed=1.0x", "progress=end"]);
        assert_eq!(tick.progress, Some(ProgressState::End));
    }

    #[test]
    fn percent_from_computes_and_clamps() {
        let tick = FfmpegTick {
            out_time_us: Some(50_000_000),
            speed: None,
            progress: Some(ProgressState::Continue),
        };
        assert_eq!(percent_from(&tick, 100.0), Some(50.0));

        let overshoot = FfmpegTick {
            out_time_us: Some(200_000_000),
            ..Default::default()
        };
        assert_eq!(percent_from(&overshoot, 100.0), Some(100.0));
    }

    #[test]
    fn percent_from_is_none_without_duration_or_tick() {
        let tick = FfmpegTick::default();
        assert_eq!(percent_from(&tick, 100.0), None);
        let with_time = FfmpegTick {
            out_time_us: Some(1),
            ..Default::default()
        };
        assert_eq!(percent_from(&with_time, 0.0), None);
    }

    #[test]
    fn builds_exact_transcode_args() {
        let spec = ConvertSpec {
            input_path: "C:\\in\\video.mov".to_string(),
            output_dir: "C:\\out".to_string(),
            container: "mp4".to_string(),
            video_codec: Some("h264".to_string()),
            audio_codec: None,
        };
        let args = build_transcode_args(&spec, Path::new("C:\\out\\video.mp4"));

        assert_eq!(
            args,
            vec![
                "-y",
                "-i",
                "C:\\in\\video.mov",
                "-c:v",
                "h264",
                "-c:a",
                "copy",
                "-progress",
                "pipe:1",
                "-nostats",
                "C:\\out\\video.mp4",
            ]
        );
    }
}
