//! Closed-set validation for everything that becomes a subprocess argument.
//!
//! `spawn_streamed` passes an args *array* with no shell, so classic shell
//! injection (`; rm -rf`) is already impossible. Two things an args array does
//! not stop, and this module does:
//!
//! 1. **Flag injection.** Arguments are positional. A "codec" of `-vf` is not
//!    a codec name ffmpeg rejects — it is a new ffmpeg *flag*, and whatever
//!    follows becomes its value. The same holds for a URL of `--exec`, which
//!    yt-dlp parses as an option rather than a positional URL.
//! 2. **Path traversal.** `container` is interpolated into the output file
//!    name, and `Path::join` on a relative `../` path walks straight out of
//!    the chosen output directory. ffmpeg runs with `-y`, so the escape
//!    overwrites the destination silently.
//!
//! The frontend already offers these as fixed `Select` options, but per
//! `Rust-Tauri/05` every command argument is treated as attacker-controlled —
//! a frontend bug is the expected "attacker" here, not a hypothetical one.
//! Kept in `core/` (no `tauri` import) so the rules are unit-testable.

use crate::error::{AppError, AppResult};

use super::types::{ConvertSpec, DownloadSpec};

/// Output containers, mirroring `CONTAINER_OPTIONS` in
/// `src/app/convert/quick/data.ts`.
pub const CONTAINERS: [&str; 3] = ["mp4", "mkv", "webm"];

/// Mirrors `VIDEO_CODEC_OPTIONS`. `copy` is the no-re-encode passthrough.
pub const VIDEO_CODECS: [&str; 5] = ["copy", "h264", "hevc", "vp9", "av1"];

/// Mirrors `AUDIO_CODEC_OPTIONS`.
pub const AUDIO_CODECS: [&str; 3] = ["copy", "aac", "opus"];

fn one_of(value: &str, allowed: &[&str], label: &str) -> AppResult<()> {
    if allowed.contains(&value) {
        return Ok(());
    }
    Err(AppError::validation(format!(
        "unsupported {label} {value:?} — expected one of: {}",
        allowed.join(", ")
    )))
}

/// Accepts only `http`/`https`. This rejects `file://` and, more importantly,
/// anything starting with `-`, which yt-dlp would read as an option instead of
/// the positional URL it is passed as.
pub fn url(value: &str) -> AppResult<()> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("no URL given"));
    }

    let lowered = trimmed.to_ascii_lowercase();
    if !(lowered.starts_with("http://") || lowered.starts_with("https://")) {
        return Err(AppError::validation(
            "only http:// and https:// URLs are supported",
        ));
    }

    // A URL cannot contain raw whitespace; if it does, it was not a URL.
    if trimmed.split_whitespace().count() != 1 {
        return Err(AppError::validation("URL must not contain whitespace"));
    }

    Ok(())
}

/// yt-dlp format selectors are things like `137+140`, `bv*+ba/b`, `best`.
/// The charset below covers that syntax while excluding a leading `-`, which
/// would turn the selector into an option.
pub fn format_id(value: &str) -> AppResult<()> {
    if value.is_empty() {
        return Err(AppError::validation("format selector must not be empty"));
    }

    let allowed = |c: char| {
        c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '*' | '.' | '_' | '-' | '[' | ']')
    };
    if !value.chars().all(allowed) {
        return Err(AppError::validation(
            "format selector contains unsupported characters",
        ));
    }

    // Only the *leading* character matters for option parsing.
    if value.starts_with('-') {
        return Err(AppError::validation(
            "format selector must not start with '-'",
        ));
    }

    Ok(())
}

/// A container doubles as the output file's extension, so it must be a bare
/// allowlisted token — never a path fragment.
pub fn container(value: &str) -> AppResult<()> {
    one_of(value, &CONTAINERS, "container")
}

pub fn video_codec(value: &str) -> AppResult<()> {
    one_of(value, &VIDEO_CODECS, "video codec")
}

pub fn audio_codec(value: &str) -> AppResult<()> {
    one_of(value, &AUDIO_CODECS, "audio codec")
}

/// Full check for an incoming download request. Directory existence is left to
/// the command layer, which needs `async` filesystem access.
pub fn download_spec(spec: &DownloadSpec) -> AppResult<()> {
    url(&spec.url)?;
    if let Some(selector) = spec.format_id.as_deref() {
        format_id(selector)?;
    }
    Ok(())
}

/// Full check for an incoming convert request.
pub fn convert_spec(spec: &ConvertSpec) -> AppResult<()> {
    container(&spec.container)?;
    if let Some(codec) = spec.video_codec.as_deref() {
        video_codec(codec)?;
    }
    if let Some(codec) = spec.audio_codec.as_deref() {
        audio_codec(codec)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn download(url: &str, format_id: Option<&str>) -> DownloadSpec {
        DownloadSpec {
            url: url.to_string(),
            title: "Example".to_string(),
            format_id: format_id.map(str::to_string),
            audio_only: false,
            output_dir: "C:\\out".to_string(),
        }
    }

    fn convert(container: &str, video: Option<&str>, audio: Option<&str>) -> ConvertSpec {
        ConvertSpec {
            input_path: "C:\\in\\clip.mkv".to_string(),
            output_dir: "C:\\out".to_string(),
            container: container.to_string(),
            video_codec: video.map(str::to_string),
            audio_codec: audio.map(str::to_string),
        }
    }

    #[test]
    fn ordinary_requests_pass() {
        assert!(download_spec(&download(
            "https://example.com/watch?v=abc",
            Some("137+140")
        ))
        .is_ok());
        assert!(download_spec(&download("http://example.com/v", None)).is_ok());
        assert!(convert_spec(&convert("mp4", Some("h264"), Some("aac"))).is_ok());
        assert!(convert_spec(&convert("webm", None, None)).is_ok());
    }

    #[test]
    fn a_url_that_is_really_a_yt_dlp_option_is_refused() {
        // The whole point: as a positional arg these are parsed as options,
        // and `--exec` reaches arbitrary command execution.
        for hostile in [
            "--exec=calc.exe",
            "--config-location=C:\\evil.conf",
            "-o/tmp/x",
            "--paths=C:\\Windows",
        ] {
            assert!(
                url(hostile).is_err(),
                "{hostile:?} must not be accepted as a URL"
            );
        }
    }

    #[test]
    fn non_http_schemes_are_refused() {
        for hostile in ["file:///etc/passwd", "ftp://example.com/x", "javascript:1"] {
            assert!(url(hostile).is_err(), "{hostile:?} must be refused");
        }
    }

    #[test]
    fn a_url_with_whitespace_is_refused() {
        assert!(url("https://example.com/a b").is_err());
    }

    #[test]
    fn a_format_selector_cannot_become_a_flag() {
        assert!(format_id("--exec").is_err());
        assert!(format_id("-f").is_err());
        assert!(
            format_id("137 --exec=calc").is_err(),
            "space is not allowed"
        );
        assert!(format_id("").is_err());
    }

    #[test]
    fn real_format_selectors_still_pass() {
        // The UI sends ids straight out of yt-dlp's own format list, plus the
        // default `bv*+ba/b` fallback.
        for good in ["137+140", "bv*+ba/b", "best", "22", "bestaudio"] {
            assert!(format_id(good).is_ok(), "{good:?} must be accepted");
        }
    }

    #[test]
    fn a_container_cannot_traverse_out_of_the_output_directory() {
        // `format!("{stem}.{container}")` joined onto the output dir: a
        // relative `..` container would escape it, and ffmpeg's `-y` would
        // overwrite the target without asking.
        for hostile in ["../../../evil.mp4", "mp4/../../x", "mp4 -y", ""] {
            assert!(
                container(hostile).is_err(),
                "{hostile:?} must not be accepted as a container"
            );
        }
    }

    #[test]
    fn a_codec_cannot_become_an_ffmpeg_flag() {
        assert!(video_codec("-vf").is_err());
        assert!(audio_codec("-f").is_err());
        assert!(video_codec("h264 -y").is_err());
    }

    #[test]
    fn the_allowlists_match_the_frontend_select_options() {
        // Guards against the two lists drifting apart; the UI offers exactly
        // these in src/app/convert/quick/data.ts.
        assert_eq!(CONTAINERS, ["mp4", "mkv", "webm"]);
        assert_eq!(VIDEO_CODECS, ["copy", "h264", "hevc", "vp9", "av1"]);
        assert_eq!(AUDIO_CODECS, ["copy", "aac", "opus"]);
    }
}
