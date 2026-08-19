//! The media job engine: download (yt-dlp) and transcode (ffmpeg) as
//! streamed, cancellable, bounded-concurrency background jobs.
//!
//! Split the same way as `core::tools`: `types` is the IPC/internal shapes
//! mirrored by hand in `src/lib/types.ts`, `spawn` is the one generic
//! streamed-subprocess runner, `ytdlp`/`ffmpeg_tool`/`ffprobe` are pure
//! argument-building and output-parsing for each external binary, `engine` is
//! the only stateful piece (the queue and dispatcher), and `history` is the
//! persisted, capped record of finished jobs.
//!
//! Nothing here imports `tauri`. The thin `#[tauri::command]` adapters and
//! the dispatch loop that ties `engine` to real subprocesses live in
//! `commands::media`.

pub mod engine;
pub mod ffmpeg_tool;
pub mod ffprobe;
pub mod history;
pub mod spawn;
pub mod types;
pub mod validate;
pub mod ytdlp;
