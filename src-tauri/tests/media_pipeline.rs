//! End-to-end proof that the media layer drives real binaries.
//!
//! The unit tests in `core::media::*` cover argument building and line parsing
//! against synthetic input; nothing there ever executes ffmpeg. This file
//! closes that gap: it generates a real clip, probes it with the real
//! `ffprobe`, transcodes it with the real `ffmpeg` through `spawn_streamed`,
//! and asserts that progress blocks actually parse into rising percentages.
//!
//! Ignored by default because it needs ffmpeg/ffprobe on `PATH`, which CI
//! deliberately does not provide (both are user-installed managed tools). Run
//! it with `cargo test --test media_pipeline -- --ignored --nocapture`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use app_lib::core::media::ffmpeg_tool::{self, ProgressState};
use app_lib::core::media::ffprobe;
use app_lib::core::media::spawn::{spawn_streamed, SpawnRequest};
use app_lib::core::media::types::ConvertSpec;
use tokio::sync::watch;

fn tool(name: &str) -> PathBuf {
    PathBuf::from(name)
}

static COUNTER: AtomicU32 = AtomicU32::new(0);

/// Same throwaway-directory shape as the `core::media::history` tests — the
/// crate has no `tempfile` dev-dependency and does not need one.
struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "theatlas-media-pipeline-test-{}-{}",
            std::process::id(),
            id
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        Self(dir)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Renders a 3-second test pattern so the transcode below has real frames to
/// chew through — long enough that ffmpeg emits several progress blocks.
async fn make_source(dir: &Path) -> PathBuf {
    let source = dir.join("source.mp4");
    let args: Vec<String> = vec![
        "-y".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "testsrc=size=320x240:rate=30:duration=3".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "sine=frequency=440:duration=3".into(),
        "-c:v".into(),
        "libx264".into(),
        "-c:a".into(),
        "aac".into(),
        "-shortest".into(),
        source.to_string_lossy().into_owned(),
    ];

    let (_tx, rx) = watch::channel(false);
    let status = spawn_streamed(
        SpawnRequest {
            program: &tool("ffmpeg"),
            args: &args,
        },
        rx,
        |_| {},
        |_| {},
    )
    .await
    .expect("ffmpeg must be on PATH to run this test");

    assert!(status.success(), "fixture render failed");
    assert!(source.is_file(), "fixture was not written");
    source
}

#[tokio::test]
#[ignore = "needs ffmpeg and ffprobe on PATH"]
async fn transcodes_a_real_file_and_reports_rising_progress() {
    let dir = TempDir::new();
    let source = make_source(dir.path()).await;

    // ── Probe: the real ffprobe JSON must parse into a usable duration ──────
    let probe_args = ffprobe::build_probe_args(&source);
    let raw = Arc::new(Mutex::new(String::new()));
    let sink = Arc::clone(&raw);
    let (_tx, rx) = watch::channel(false);
    spawn_streamed(
        SpawnRequest {
            program: &tool("ffprobe"),
            args: &probe_args,
        },
        rx,
        move |line| {
            if let Ok(mut buf) = sink.lock() {
                buf.push_str(line);
                buf.push('\n');
            }
        },
        |_| {},
    )
    .await
    .expect("ffprobe run");

    let json = raw.lock().expect("probe output lock").clone();
    let probe = ffprobe::parse_probe_json(&json, &source).expect("probe json parses");
    let duration = probe.duration_secs.expect("probe reports a duration");
    assert!(
        (2.5..3.5).contains(&duration),
        "expected ~3s, got {duration}"
    );
    assert_eq!(probe.video_codec.as_deref(), Some("h264"));
    assert_eq!(probe.width, Some(320));
    assert_eq!(probe.height, Some(240));

    // ── Transcode: real ffmpeg, progress parsed off the real pipe ──────────
    let spec = ConvertSpec {
        input_path: source.to_string_lossy().into_owned(),
        output_dir: dir.path().to_string_lossy().into_owned(),
        container: "mkv".into(),
        video_codec: None, // copy
        audio_codec: None, // copy
    };
    let output = dir.path().join("source.mkv");
    let args = ffmpeg_tool::build_transcode_args(&spec, &output);

    let percents = Arc::new(Mutex::new(Vec::<f64>::new()));
    let saw_end = Arc::new(Mutex::new(false));
    let sink = Arc::clone(&percents);
    let end = Arc::clone(&saw_end);

    // ffmpeg's `-progress pipe:1` stream is a run of `key=value` lines closed
    // by `progress=continue` / `progress=end`; accumulate a block, then parse.
    let mut block: Vec<String> = Vec::new();
    let (_tx, rx) = watch::channel(false);
    let status = spawn_streamed(
        SpawnRequest {
            program: &tool("ffmpeg"),
            args: &args,
        },
        rx,
        move |line| {
            let is_marker = line.starts_with("progress=");
            block.push(line.to_string());
            if !is_marker {
                return;
            }
            let borrowed: Vec<&str> = block.iter().map(String::as_str).collect();
            let tick = ffmpeg_tool::parse_progress_block(&borrowed);
            if let Some(percent) = ffmpeg_tool::percent_from(&tick, duration) {
                if let Ok(mut out) = sink.lock() {
                    out.push(percent);
                }
            }
            if matches!(tick.progress, Some(ProgressState::End)) {
                if let Ok(mut flag) = end.lock() {
                    *flag = true;
                }
            }
            block.clear();
        },
        |_| {},
    )
    .await
    .expect("ffmpeg transcode run");

    assert!(status.success(), "transcode exited nonzero");
    assert!(output.is_file(), "transcode produced no output file");

    // Only invariants of the parser's contract are asserted here. The *number*
    // of progress blocks is ffmpeg's business — a stream copy of a short clip
    // legitimately finishes in a single tick — so asserting a count would be
    // testing the machine's speed, not this code.
    let percents = percents.lock().expect("percent lock").clone();
    assert!(
        !percents.is_empty(),
        "no progress block parsed into a percentage at all"
    );
    assert!(
        percents.windows(2).all(|w| w[1] >= w[0]),
        "progress went backwards: {percents:?}"
    );
    assert!(
        percents.iter().all(|p| (0.0..=100.0).contains(p)),
        "percent out of range: {percents:?}"
    );
    assert!(*saw_end.lock().expect("end lock"), "never saw progress=end");
}

#[tokio::test]
#[ignore = "needs ffmpeg on PATH"]
async fn cancelling_a_real_transcode_kills_it_before_it_finishes() {
    let dir = TempDir::new();
    let output = dir.path().join("out.mp4");

    // A 10-minute re-encode: guaranteed to still be running when we cancel.
    let args: Vec<String> = vec![
        "-y".into(),
        "-f".into(),
        "lavfi".into(),
        "-i".into(),
        "testsrc=size=1280x720:rate=30:duration=600".into(),
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "veryslow".into(),
        output.to_string_lossy().into_owned(),
    ];

    let (tx, rx) = watch::channel(false);
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        let _ = tx.send(true);
    });

    let started = std::time::Instant::now();
    let result = spawn_streamed(
        SpawnRequest {
            program: &tool("ffmpeg"),
            args: &args,
        },
        rx,
        |_| {},
        |_| {},
    )
    .await;

    let error = result.expect_err("cancelled run must not report success");
    assert!(
        error.to_string().contains("cancelled"),
        "unexpected error: {error}"
    );
    assert!(
        started.elapsed() < std::time::Duration::from_secs(30),
        "cancellation did not kill the child promptly"
    );
}
