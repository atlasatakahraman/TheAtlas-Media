//! Pulling the wanted binaries out of a downloaded archive.
//!
//! Only named files are extracted, and only into the destination directory —
//! an archive entry's own path is never trusted. That is the standard
//! "zip slip" defence: an entry called `../../../../etc/cron.d/evil` writes
//! wherever the process can reach if you join it to the destination. Here the
//! entry contributes nothing but its base name, and that base name has to be
//! on the caller's wanted list before anything is written at all.

use std::path::{Path, PathBuf};

use super::registry::ArchiveKind;
use crate::error::{AppError, AppResult};

/// Extract `wanted` (matched by base file name) from `archive_path` into
/// `dest_dir`. Returns the paths actually written, in the order found.
///
/// Decompression is CPU-bound and runs on the blocking pool — an xz stream of
/// a full ffmpeg build would otherwise hold a runtime worker for seconds.
pub async fn extract(
    archive_path: &Path,
    dest_dir: &Path,
    kind: ArchiveKind,
    wanted: &[String],
) -> AppResult<Vec<PathBuf>> {
    let archive = archive_path.to_path_buf();
    let dest = dest_dir.to_path_buf();
    let wanted = wanted.to_vec();

    tokio::task::spawn_blocking(move || extract_blocking(&archive, &dest, kind, &wanted)).await?
}

fn extract_blocking(
    archive_path: &Path,
    dest_dir: &Path,
    kind: ArchiveKind,
    wanted: &[String],
) -> AppResult<Vec<PathBuf>> {
    match kind {
        ArchiveKind::TarXz => extract_tar_xz(archive_path, dest_dir, wanted),
        ArchiveKind::Zip => extract_zip(archive_path, dest_dir, wanted),
        // A raw download is already the binary; the download step names it
        // correctly and there is nothing to unpack.
        ArchiveKind::Raw => Ok(vec![archive_path.to_path_buf()]),
    }
}

/// The only place an archive entry's name is allowed to influence a path.
///
/// Takes the base name and nothing else, then requires it to be on the wanted
/// list. Directory components in the entry — including `..` — are discarded
/// before they can be joined to anything.
fn safe_destination(entry_path: &Path, dest_dir: &Path, wanted: &[String]) -> Option<PathBuf> {
    let name = entry_path.file_name()?.to_str()?;
    if name.is_empty() || !wanted.iter().any(|w| w == name) {
        return None;
    }
    Some(dest_dir.join(name))
}

fn extract_tar_xz(
    archive_path: &Path,
    dest_dir: &Path,
    wanted: &[String],
) -> AppResult<Vec<PathBuf>> {
    let file = std::fs::File::open(archive_path)
        .map_err(|e| AppError::extraction(format!("cannot open archive: {e}")))?;
    let mut archive = tar::Archive::new(xz2::read::XzDecoder::new(file));
    let mut written = Vec::new();

    let entries = archive
        .entries()
        .map_err(|e| AppError::extraction(e.to_string()))?;

    for entry in entries {
        let mut entry = entry.map_err(|e| AppError::extraction(e.to_string()))?;
        let entry_path = entry
            .path()
            .map_err(|e| AppError::extraction(e.to_string()))?
            .to_path_buf();

        let Some(dest) = safe_destination(&entry_path, dest_dir, wanted) else {
            continue;
        };

        entry
            .unpack(&dest)
            .map_err(|e| AppError::extraction(format!("cannot unpack {}: {e}", dest.display())))?;
        written.push(dest);
    }

    Ok(written)
}

fn extract_zip(archive_path: &Path, dest_dir: &Path, wanted: &[String]) -> AppResult<Vec<PathBuf>> {
    let file = std::fs::File::open(archive_path)
        .map_err(|e| AppError::extraction(format!("cannot open archive: {e}")))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| AppError::extraction(e.to_string()))?;
    let mut written = Vec::new();

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| AppError::extraction(e.to_string()))?;

        if entry.is_dir() {
            continue;
        }

        // `enclosed_name` is the zip crate's own traversal-safe accessor; the
        // base-name reduction below is a second, independent check rather than
        // a replacement for it.
        let entry_path = entry
            .enclosed_name()
            .unwrap_or_else(|| PathBuf::from(entry.name()));

        let Some(dest) = safe_destination(&entry_path, dest_dir, wanted) else {
            continue;
        };

        let mut out = std::fs::File::create(&dest)
            .map_err(|e| AppError::extraction(format!("cannot create {}: {e}", dest.display())))?;
        std::io::copy(&mut entry, &mut out).map_err(|e| AppError::extraction(e.to_string()))?;
        written.push(dest);
    }

    Ok(written)
}

/// Give a freshly extracted binary the executable bit. No-op on Windows.
pub fn set_executable(path: &Path) -> AppResult<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| AppError::io(format!("cannot mark {} executable: {e}", path.display())))?;
    }
    #[cfg(not(unix))]
    let _ = path;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let dir = std::env::temp_dir().join(format!(
            "theatlas-extract-{tag}-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_traversing_entry_name_cannot_escape_the_destination() {
        let dest = Path::new("/dest");
        let wanted = vec!["ffmpeg".to_string()];

        let resolved = safe_destination(Path::new("../../../../tmp/ffmpeg"), dest, &wanted);
        assert_eq!(resolved, Some(dest.join("ffmpeg")));
    }

    #[test]
    fn an_unwanted_entry_is_skipped_entirely() {
        let wanted = vec!["ffmpeg".to_string()];
        assert!(safe_destination(Path::new("bin/ffplay"), Path::new("/dest"), &wanted).is_none());
    }

    #[test]
    fn a_nested_wanted_entry_lands_flat_in_the_destination() {
        // BtbN ships `ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe`; the
        // managed dir is flat.
        let wanted = vec!["ffmpeg.exe".to_string()];
        let resolved = safe_destination(
            Path::new("ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe"),
            Path::new("/dest"),
            &wanted,
        );
        assert_eq!(resolved, Some(PathBuf::from("/dest").join("ffmpeg.exe")));
    }

    #[tokio::test]
    async fn extracts_only_the_wanted_members_of_a_zip() {
        use std::io::Write;
        use zip::write::SimpleFileOptions;

        let dir = scratch("zip");
        let archive_path = dir.join("bundle.zip");
        let dest = dir.join("out");
        std::fs::create_dir_all(&dest).unwrap();

        {
            let file = std::fs::File::create(&archive_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = SimpleFileOptions::default();

            zip.start_file("build/bin/wanted.exe", options).unwrap();
            zip.write_all(b"wanted payload").unwrap();

            zip.start_file("build/bin/ignored.exe", options).unwrap();
            zip.write_all(b"ignored payload").unwrap();

            zip.finish().unwrap();
        }

        let written = extract(
            &archive_path,
            &dest,
            ArchiveKind::Zip,
            &["wanted.exe".to_string()],
        )
        .await
        .unwrap();

        assert_eq!(written, vec![dest.join("wanted.exe")]);
        assert_eq!(
            std::fs::read(dest.join("wanted.exe")).unwrap(),
            b"wanted payload"
        );
        assert!(!dest.join("ignored.exe").exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_zip_entry_that_traverses_still_lands_inside_the_destination() {
        use std::io::Write;
        use zip::write::SimpleFileOptions;

        let dir = scratch("slip");
        let archive_path = dir.join("evil.zip");
        let dest = dir.join("out");
        std::fs::create_dir_all(&dest).unwrap();

        {
            let file = std::fs::File::create(&archive_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            zip.start_file("../../escaped.exe", SimpleFileOptions::default())
                .unwrap();
            zip.write_all(b"payload").unwrap();
            zip.finish().unwrap();
        }

        let written = extract(
            &archive_path,
            &dest,
            ArchiveKind::Zip,
            &["escaped.exe".to_string()],
        )
        .await
        .unwrap();

        assert_eq!(written, vec![dest.join("escaped.exe")]);
        assert!(!dir.join("escaped.exe").exists(), "escaped the destination");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_raw_download_needs_no_unpacking() {
        let dir = scratch("raw");
        let binary = dir.join("yt-dlp.exe");
        std::fs::write(&binary, b"binary").unwrap();

        let written = extract(&binary, &dir, ArchiveKind::Raw, &[]).await.unwrap();
        assert_eq!(written, vec![binary]);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_corrupt_archive_is_an_extraction_error() {
        let dir = scratch("corrupt");
        let archive_path = dir.join("broken.zip");
        std::fs::write(&archive_path, b"this is not a zip file").unwrap();

        let error = extract(&archive_path, &dir, ArchiveKind::Zip, &["x".into()])
            .await
            .unwrap_err();
        assert_eq!(error.kind(), "extraction");

        std::fs::remove_dir_all(&dir).ok();
    }
}
