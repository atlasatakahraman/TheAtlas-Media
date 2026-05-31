# Skill: lofty tag round-trip

Used post-download to normalize tags on audio-only outputs (`BestAudio` preset).

```rust
use lofty::{config::WriteOptions, file::TaggedFileExt, prelude::*, probe::Probe, tag::ItemKey};

pub fn apply_tags(path: &Path, t: AppTags) -> Result<(), MediaError> {
    let mut file = Probe::open(path).map_err(MediaError::probe)?.read().map_err(MediaError::probe)?;
    let tag = file.primary_tag_mut().ok_or(MediaError::NoTagSupport)?;
    if let Some(v) = t.title  { tag.insert_text(ItemKey::TrackTitle, v); }
    if let Some(v) = t.artist { tag.insert_text(ItemKey::TrackArtist, v); }
    if let Some(v) = t.album  { tag.insert_text(ItemKey::AlbumTitle, v); }
    file.save_to_path(path, WriteOptions::default()).map_err(|e| MediaError::Save(e.to_string()))?;
    Ok(())
}
```

Tests must round-trip on at least MP3, M4A, and FLAC fixtures (generate them at test time with the crate-installed ffmpeg).
