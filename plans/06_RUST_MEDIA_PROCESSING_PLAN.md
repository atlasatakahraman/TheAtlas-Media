# Plan 06 — RUST_MEDIA_PROCESSING_ALTERNATIVES.md → Media Processing Strategy (Post-Pivot)

> **Source:** `documentation/RUST_MEDIA_PROCESSING_ALTERNATIVES.md`
> **Companion to:** Plan 05, ADR-005.
> **Status:** **Substantially simplified vs. earlier draft.** The `yt-dlp` crate (Plan 05) manages ffmpeg installation and orchestration internally, so we no longer need a separate `ffmpeg-sidecar` integration for the default download path. This plan is now scoped to **optional supplementary tooling** for niche features.

---

## 1. What changed (and why this plan is now short)

Earlier draft assumed we'd:
- Wrap `ffmpeg` ourselves via `ffmpeg-sidecar`.
- Bundle the binary via `build.rs`.
- Build a `MediaProcessor` trait with three concrete impls.
- Handle FFmpeg LGPL compliance in a custom way.

After picking the boul2gom `yt-dlp` crate (ADR-005, Plan 05 §1):
- The crate installs ffmpeg via `LibraryInstaller::install_ffmpeg()`.
- The crate invokes ffmpeg internally for muxing, stream copy, and post-processing (chapter embedding, precision trimming).
- For 90 % of the app's needs (download → merge audio+video → done), we touch ffmpeg only **through** the crate.

So this plan is now:
- A small **supplementary toolkit** for metadata tagging and audio probing.
- A **fallback ffmpeg invocation** path for the rare cases where the crate's built-in post-processing isn't enough (e.g., user-requested re-encode to a different codec — not in v0.1).

---

## 2. Decisions (locked)

| Need | Decision | Source |
|---|---|---|
| Download merge / remux | **Use the `yt-dlp` crate's built-in ffmpeg orchestration** | Plan 05, ADR-005 |
| ffmpeg binary acquisition | **`LibraryInstaller::install_ffmpeg()` (handled by the crate)** | yt-dlp crate v2.7.x docs |
| Audio metadata tagging (write ID3, MP4 atoms after download) | **`lofty` crate** (pure Rust) | RUST_MEDIA_PROCESSING_ALTERNATIVES.md |
| Audio inspection / probing (optional, v0.2) | **`symphonia` crate** behind `media-symphonia` feature | RUST_MEDIA_PROCESSING_ALTERNATIVES.md |
| Custom re-encode workflows (deferred to v0.2+) | **`ffmpeg-sidecar` reusing the crate-installed binary** | This plan §4 |
| `ffmpeg-next` (C bindings) | **Rejected** | Heavy packaging, no clear benefit over invoking the existing binary |
| GStreamer | **Rejected** | Too heavy for a downloader |
| `mp4`, `webm-iterable`, `rav1e`, `openh264`, `audiopus`, `hound` | **Rejected for v0.1** | Narrow utility; not needed |

## 3. Module layout (much smaller now)

```
src-tauri/src/media/
├─ mod.rs              // re-exports
├─ tagging.rs          // lofty-backed: read/write title, artist, album, cover art
├─ probe.rs            // optional symphonia probe behind `media-symphonia` feature
└─ ffmpeg_custom.rs    // OPTIONAL — wraps the crate-installed ffmpeg binary
                       //            for user-driven re-encode workflows (v0.2+)
```

No `MediaProcessor` trait, no `Composite*`, no `Ffmpeg*` impls. The `yt-dlp` crate covers what the trait was abstracting.

## 4. Optional: custom ffmpeg invocation (v0.2 hook, not v0.1)

If/when the app gains user-driven re-encode features (e.g., "convert this downloaded mp4 to webm with libvpx-vp9"), we'll need to invoke ffmpeg ourselves with custom args — the crate doesn't expose arbitrary ffmpeg args.

In that future, we reuse the **same ffmpeg binary** that the `yt-dlp` crate installed (no second binary download):

```rust
// src-tauri/src/media/ffmpeg_custom.rs (v0.2)
use ffmpeg_sidecar::command::FfmpegCommand;

pub async fn reencode(input: &Path, output: &Path, opts: ReencodeOpts) -> Result<(), MediaError> {
    let ffmpeg_path = crate::download::binaries::resolved().ffmpeg_path();
    let mut child = FfmpegCommand::new_with_path(ffmpeg_path)
        .input(input)
        .codec_video(opts.video_codec)
        .codec_audio(opts.audio_codec)
        .arg("-movflags").arg("+faststart")
        .output(output)
        .spawn()?;
    // … structured progress via child.iter() → ProgressSink
    Ok(())
}
```

Dependency (not added until v0.2):
```toml
ffmpeg-sidecar = { version = "2", default-features = false }   # no auto-download; we have a binary
```

## 5. `lofty` for post-download tagging (v0.1)

The `yt-dlp` crate writes some metadata automatically. For app-specific tagging (e.g., adding a "Downloaded from TheAtlas" comment, or re-tagging audio-only downloads with normalized fields), we use `lofty`:

```rust
// src-tauri/src/media/tagging.rs
use lofty::{Probe, TaggedFileExt, ItemKey, TagItem};

pub fn apply_tags(path: &Path, tags: AppTags) -> Result<(), MediaError> {
    let mut file = Probe::open(path).map_err(MediaError::probe)?.read()?;
    let tag = file.primary_tag_mut().ok_or(MediaError::NoTagSupport)?;
    if let Some(t) = tags.title  { tag.insert(TagItem::new(ItemKey::TrackTitle, t.into())); }
    if let Some(a) = tags.artist { tag.insert(TagItem::new(ItemKey::TrackArtist, a.into())); }
    if let Some(a) = tags.album  { tag.insert(TagItem::new(ItemKey::AlbumTitle, a.into())); }
    file.save_to_path(path).map_err(MediaError::save)?;
    Ok(())
}
```

Dependency:
```toml
lofty = "0.23"
```

Used post-download in `DownloadService::finish()` (Plan 05 §8) when the `BestAudio` preset was selected.

## 6. Optional: `symphonia` probe (v0.2, feature-flagged)

For showing waveform thumbnails or duration estimates without invoking ffprobe:

```toml
[features]
media-symphonia = ["dep:symphonia"]

[dependencies.symphonia]
version = "0.5"
optional = true
default-features = false
features = ["mp3", "aac", "flac", "isomp4"]
```

Deferred to v0.2 unless a feature explicitly needs it.

## 7. Error type

```rust
// src-tauri/src/media/error.rs
#[derive(Debug, thiserror::Error)]
pub enum MediaError {
    #[error("probe failed: {0}")]
    Probe(String),
    #[error("no tag support for this container")]
    NoTagSupport,
    #[error("save failed: {0}")]
    Save(String),
    #[error("ffmpeg not available")]
    FfmpegMissing,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}
```

Maps into `contracts::CommandError::Internal(...)` when surfacing to the UI.

## 8. `tauri.conf.json` + capabilities

**No changes from Plan 05.** Specifically:

- **No `externalBin` entries** for ffmpeg — the `yt-dlp` crate handles the binary, not Tauri's bundler.
- **No `shell:allow-execute`** capability needed — the crate spawns subprocesses from Rust, not through the Tauri shell plugin.

This is a significant simplification vs. the previous draft. The Tauri capability JSON stays minimal:

```json
{
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "fs:allow-read-text-file",
    "opener:allow-open-path"
  ]
}
```

## 9. Licensing handoff to Plan 08

The `yt-dlp` crate fetches:
- **yt-dlp** (Unlicense / public-domain-ish) — bundle attribution text.
- **ffmpeg** — the crate fetches an LGPL static build by default. We must:
  - Verify the variant in `Diagnostics` (Plan 05 §6.2 `get_diagnostics`).
  - Ship the LGPL license text in `src-tauri/resources/LICENSES/FFmpeg-LGPL-2.1.txt`.
  - Display the FFmpeg notice in the About page.
  - Provide a WRITTEN OFFER for corresponding source (LGPL §6).

All of this is owned by **Plan 08**. This plan just confirms that ffmpeg-LGPL is what the crate installs by default and that we'll bundle the same license file regardless of acquisition path.

## 10. Diagnostics surface

`get_diagnostics` (Plan 05 §6.2) returns ffmpeg version + path + variant. The frontend (`app/settings/diagnostics/page.tsx`) renders:

- ✅ `ffmpeg 7.0.2 (LGPL) — managed by yt-dlp crate at /home/user/.local/share/TheAtlas/bin/ffmpeg`
- "Re-install" button → calls `update_yt_dlp` (Plan 05 §2.2), which the crate uses to refresh both binaries.

## 11. Phase mapping

| Doc phase | Status |
|---|---|
| 1 Define abstraction (`MediaProcessor` trait) | **Skipped** — the `yt-dlp` crate is the abstraction. |
| 2 Add metadata (lofty) | v0.1 (§5) |
| 3 Add production processing (ffmpeg) | **Delegated** — happens inside the crate. |
| 4 Add narrow Rust-native paths (symphonia, mp4, webm-iterable) | v0.2 (§6), behind feature flags |
| 5 Packaging and validation | Plan 05 §17 + Plan 08 |

## 12. Acceptance criteria

- [ ] `lofty` integration in `media/tagging.rs` round-trips title/artist/album/cover on MP3 + M4A + FLAC.
- [ ] After a `BestAudio` download, the output file carries normalized tags.
- [ ] `get_diagnostics` reports the crate-installed ffmpeg binary + version + variant (LGPL/GPL).
- [ ] Build hard-errors if the crate's installer returns a GPL ffmpeg variant (per Plan 08).
- [ ] No `shell:allow-execute` entries in capability JSON.
- [ ] No `ffmpeg-sidecar` dep in v0.1 (`grep "ffmpeg-sidecar" src-tauri/Cargo.toml | wc -l` == 0).

## 13. Execution checklist (v0.1 only)

- [ ] **M-1** Add `lofty = "0.23"` to `src-tauri/Cargo.toml`.
- [ ] **M-2** Create `src-tauri/src/media/{mod,tagging,error}.rs` skeletons.
- [ ] **M-3** Implement `media::tagging::apply_tags`; unit test round-trips on MP3, M4A, FLAC fixtures.
- [ ] **M-4** Wire `apply_tags` call from `DownloadService::finish()` when preset == `BestAudio`.
- [ ] **M-5** Extend `Diagnostics` (Plan 05) with `ffmpeg_variant: "lgpl" | "gpl" | "unknown"`. Hard-error in CI if `gpl` is seen.
- [ ] **M-6** Update `app/settings/diagnostics/page.tsx` to render ffmpeg block.
- [ ] **M-7** Bundle FFmpeg LGPL license text (Plan 08 handoff).
- [ ] **M-8** Mark v0.2 hooks in `ffmpeg_custom.rs` as `#[cfg(feature = "media-reencode")]`-gated for now; do not implement until needed.
- [ ] **M-9** Add ADR-006 stub "When to add custom ffmpeg re-encode" (defer scope discussion to a future PR).
