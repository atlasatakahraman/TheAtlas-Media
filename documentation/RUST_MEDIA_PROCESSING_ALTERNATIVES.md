# Rust Media Processing Alternatives for Tauri 2

> **Revision (2026-05-31):** This evaluation predates the choice of the boul2gom `yt-dlp` Rust crate. With that crate adopted (see `YT_DLP_RUST_BACKEND.md` revision history and `docs/adr/ADR-005-yt-dlp-crate-pivot.md`), the **crate manages and invokes ffmpeg internally** for the download → merge → tag pipeline. This document is retained as the evaluation of fallback / supplementary media-processing tools; v0.1 only uses `lofty` (post-download tagging) on top of what the crate does. A direct `ffmpeg-sidecar` integration is deferred to v0.2 for custom re-encode workflows and would reuse the same crate-installed binary.

This document evaluates Rust-native and Rust-facing alternatives to FFmpeg for TheAtlas Media Processing's Tauri 2 backend.

The project needs media processing for a desktop video downloader/converter workflow, especially:

- merging separate audio/video streams
- remuxing MP4/WebM outputs
- extracting or converting audio
- reading/writing metadata
- tracking progress
- packaging reliably across Linux, macOS, and Windows

## Summary

There is currently no practical full Rust-native replacement for FFmpeg that covers the complete downloader/converter workflow. Pure Rust crates can help with metadata, audio decoding, and narrow container operations, but robust merging, remuxing, transcoding, timestamp handling, codec compatibility, and post-processing still usually require FFmpeg or another native media framework.

Recommended strategy:

1. Use Rust-native crates for metadata, inspection, and narrow supported cases.
2. Use an FFmpeg backend for production muxing, remuxing, and transcoding.
3. Hide all media processing behind a Rust trait so the frontend and download orchestration do not depend on a specific implementation.

## Recommended backend abstraction

```rust
trait MediaProcessor {
    async fn merge_streams(&self, request: MergeRequest) -> Result<MediaOutput, MediaError>;
    async fn extract_audio(&self, request: AudioExtractRequest) -> Result<MediaOutput, MediaError>;
    async fn read_metadata(&self, path: PathBuf) -> Result<MediaMetadata, MediaError>;
}
```

Suggested implementations:

- `RustNativeMediaProcessor`
  - handles metadata and narrow simple cases
- `FfmpegMediaProcessor`
  - handles production merge/remux/transcode workflows

Recommended architecture:

```text
Rust backend
  -> yt-dlp-compatible Rust extractor
  -> MediaProcessor trait
      -> RustNativeMediaProcessor for metadata/simple cases
      -> FfmpegMediaProcessor for merge/remux/transcode
  -> Tauri progress events
  -> React queue UI
```

## Option comparison

| Option | Type | Good for | Not good for | Tauri packaging |
|---|---|---|---|---|
| `symphonia` | Pure Rust | Audio decoding, demuxing, metadata | Muxing, encoding, remuxing, video conversion | Easy |
| `mp4` | Pure Rust | MP4 read/write experiments | Robust downloader remuxing is not proven | Easy |
| `webm-iterable` | Pure Rust | WebM/Matroska tag-level reading/writing | General muxing/transcoding | Easy |
| `ogg` | Pure Rust | Ogg packet read/write | Broad media processing | Easy |
| `lofty` | Pure Rust | Audio metadata tags | Conversion/remuxing | Easy |
| `hound` | Pure Rust | WAV read/write | Compressed audio/video | Easy |
| `rav1e` | Mostly Rust AV1 encoder | AV1 encoding from raw frames | General video conversion | Medium |
| `openh264` | Native C/C++ binding | H.264 encode/decode | Containers, audio, muxing | Medium |
| `audiopus` | Native Opus binding | Opus codec work | Containers, broad conversion | Medium |
| `gstreamer` | Native framework bindings | Full media pipelines | Lightweight packaging | Heavy |
| `ffmpeg-next` | Native FFmpeg library bindings | Full FFmpeg power inside Rust APIs | Simple distribution | Heavy |
| `ffmpeg-sidecar` | FFmpeg binary wrapper | Easiest reliable production path | Pure-native Rust goal | Medium/heavy |

## Pure Rust crates

### `lofty`

Use `lofty` for post-download metadata operations.

Good for:

- reading and writing audio tags
- title, artist, album, and cover metadata
- MP3, FLAC, MP4-style audio metadata

Not good for:

- media conversion
- remuxing
- stream merging
- video processing

Recommendation: use as a complementary metadata/tagging crate.

### `symphonia`

Use `symphonia` for Rust-native audio inspection and decoding.

Good for:

- audio decoding
- demuxing supported containers
- reading some metadata
- pure Rust integration

Limitations:

- no general muxing/remuxing
- no full encoding pipeline
- not enough for merging separate YouTube audio/video streams
- video support is not suitable as the main production path

Recommendation: use for audio probing or analysis features, not for full post-processing.

### `mp4`

Use `mp4` only for focused MP4 container experiments.

Good for:

- reading MP4 container structures
- writing MP4 files in controlled cases
- inspecting tracks and samples

Limitations:

- low documentation coverage
- robust remuxing of downloader outputs is not clearly proven
- timestamp repair, stream interleaving, and codec compatibility need careful validation

Recommendation: investigate only for narrow cases. Do not rely on it as the primary media post-processor yet.

### `webm-iterable`

Use `webm-iterable` for low-level WebM/Matroska inspection or tag-level rewriting.

Good for:

- reading WebM/Matroska tags
- writing selected tags back out
- simple container filtering experiments

Limitations:

- not a full media pipeline
- does not provide broad decoding, encoding, muxing, or transcoding
- manual handling of tracks, blocks, timing, and interleaving is required

Recommendation: useful for specialized WebM tooling, not a general FFmpeg replacement.

### `ogg`

Use `ogg` for Ogg packet-level reading and writing.

Good for:

- Ogg-specific container handling
- packet reading/writing

Limitations:

- does not provide codec conversion
- not suitable for broad media workflows

Recommendation: use only if Ogg-specific support becomes necessary.

### `hound`

Use `hound` for WAV read/write only.

Good for:

- writing WAV files
- reading WAV samples
- simple sample-level processing

Limitations:

- WAV-focused
- no compressed audio/video support
- no remuxing or conversion pipeline

Recommendation: useful only for narrow WAV workflows.

## Codec-specific crates

### `rav1e`

`rav1e` is an AV1 encoder.

Good for:

- encoding raw frames to AV1
- Rust-first AV1 encoding workflows

Limitations:

- not a general media converter
- does not handle audio, containers, demuxing, or muxing by itself
- requires other components around it

Recommendation: not needed unless the app explicitly adds AV1 encoding from raw frames.

### `openh264`

`openh264` provides Rust bindings around Cisco OpenH264.

Good for:

- H.264 elementary stream encoding/decoding
- RGB/YUV conversion workflows

Limitations:

- wraps native C/C++ code
- does not handle containers, audio, subtitles, broad muxing, or full conversion pipelines
- cross-compilation and native build settings can require extra work

Recommendation: useful only for narrow H.264-specific features.

### `audiopus`

`audiopus` wraps the native Opus library.

Good for:

- Opus audio codec operations

Limitations:

- native dependency through FFI
- does not handle containers or broad transcoding

Recommendation: use only if the app needs direct Opus codec control.

## Native media frameworks and FFmpeg-facing options

### `gstreamer`

`gstreamer` provides Rust bindings to the native GStreamer framework.

Good for:

- full media pipelines
- plugin-based decoding, encoding, muxing, and streaming workflows
- complex media applications

Limitations:

- not pure Rust
- requires GStreamer runtime and plugins
- cross-platform packaging is heavy
- plugin availability can become a support problem

Recommendation: powerful, but likely heavier than needed for a downloader/converter app unless the app grows into a general media pipeline application.

### `ffmpeg-next`

`ffmpeg-next` exposes FFmpeg APIs through Rust bindings.

Good for:

- using FFmpeg functionality from Rust APIs
- demuxing, muxing, decoding, encoding, filtering, and metadata workflows
- avoiding shell command construction

Limitations:

- still depends on native FFmpeg libraries
- linking and packaging are more complex than a sidecar binary
- FFmpeg licensing and distribution requirements still apply
- documentation coverage is limited

Recommendation: choose this if the project wants FFmpeg power through Rust APIs and accepts native library packaging complexity.

### `ffmpeg-sidecar`

`ffmpeg-sidecar` wraps a standalone FFmpeg binary from Rust.

Good for:

- reliable production media post-processing
- command execution with structured Rust APIs
- locating, bundling, or downloading FFmpeg binaries
- progress/log parsing around FFmpeg workflows

Limitations:

- not pure Rust
- still relies on an external FFmpeg executable
- FFmpeg licensing and binary distribution must be handled carefully

Recommendation: best practical default for reliability if the app can accept an app-managed FFmpeg binary.

## Recommended decision for TheAtlas Media Processing

For TheAtlas Media, use this approach:

- Use the Rust-native yt-dlp-compatible extractor for extraction and download orchestration.
- Use `lofty` for metadata/tagging.
- Use `symphonia` only for audio inspection or decoding features.
- Use FFmpeg for production merging, remuxing, and transcoding.
- Prefer `ffmpeg-sidecar` for the most reliable packaging path.
- Consider `ffmpeg-next` only if direct FFmpeg library APIs are more important than simple distribution.
- Do not rely on pure Rust crates alone for production YouTube-style post-processing yet.

## Implementation plan

### Phase 1: Define abstraction

1. Add a `MediaProcessor` trait in the Rust backend.
2. Define request/response types for merge, audio extraction, metadata, and cancellation.
3. Keep media-processing errors stable and independent from the chosen implementation.
4. Route all Tauri commands through backend services, not directly into media crates.

### Phase 2: Add metadata support

1. Add `lofty` for metadata read/write where needed.
2. Add a backend metadata service.
3. Normalize metadata values before sending them to React.
4. Treat titles, descriptions, thumbnails, and tags as untrusted display data.

### Phase 3: Add production media processing

1. Choose either `ffmpeg-sidecar` or `ffmpeg-next`.
2. Implement `FfmpegMediaProcessor` behind the `MediaProcessor` trait.
3. Support stream merge/remux for common downloader outputs.
4. Support audio extraction presets.
5. Emit progress events through Tauri.
6. Add cancellation support.

### Phase 4: Add Rust-native narrow paths

1. Evaluate `symphonia` for audio probing/inspection.
2. Evaluate `mp4` only for narrow MP4 operations.
3. Evaluate `webm-iterable` only for narrow WebM operations.
4. Keep these paths optional and fallback-capable.

### Phase 5: Packaging and validation

1. Verify Linux, macOS, and Windows packaging.
2. Document FFmpeg or native-library licensing implications.
3. Add diagnostics for missing media processing dependencies.
4. Test separate audio/video merging, MP4 remuxing, WebM remuxing, audio extraction, cancellation, and failure states.
5. Confirm release builds do not require unexpected system-installed tools unless explicitly documented.

## Final recommendation

The best engineering tradeoff is:

```text
Rust-native extractor + Rust backend orchestration + FFmpeg processor behind a trait
```

Use Rust-native crates where they are strong, but keep FFmpeg available for the hard media-processing work that pure Rust crates do not yet cover reliably.
