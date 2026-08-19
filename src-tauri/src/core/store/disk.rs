//! Directory measurement and clearing.
//!
//! Both walks are iterative with an explicit stack rather than recursive: a
//! webview cache can nest deeply, and a recursive walk turns a pathological
//! directory tree — or a symlink loop — into a stack overflow, which aborts
//! the process outright rather than returning an error.

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

/// Total size of every regular file under `dir`, in bytes.
///
/// Unreadable entries are skipped rather than propagated: "your storage is
/// 412 MB" is a status line, and failing it because one file was locked by
/// another process would be worse than being slightly low.
pub async fn dir_size_bytes(dir: &Path) -> u64 {
    let mut total: u64 = 0;
    let mut stack: Vec<PathBuf> = vec![dir.to_path_buf()];

    while let Some(current) = stack.pop() {
        let Ok(mut entries) = tokio::fs::read_dir(&current).await else {
            continue;
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let Ok(file_type) = entry.file_type().await else {
                continue;
            };

            if file_type.is_dir() {
                stack.push(entry.path());
            } else if file_type.is_file() {
                if let Ok(metadata) = entry.metadata().await {
                    total = total.saturating_add(metadata.len());
                }
            }
            // Symlinks are counted as neither. Following them could double-count
            // a directory or walk out of the tree entirely.
        }
    }

    total
}

/// Delete everything inside `dir`, leaving the directory itself.
///
/// Returns how many bytes were there beforehand. Individual failures are
/// tolerated — a webview cache routinely holds a file the running WebView2
/// process still has open, and refusing to clear the other 400 MB because of
/// it helps nobody.
pub async fn clear_dir_contents(dir: &Path) -> AppResult<u64> {
    if !dir.exists() {
        return Ok(0);
    }

    let cleared = dir_size_bytes(dir).await;

    let mut entries = tokio::fs::read_dir(dir)
        .await
        .map_err(|error| AppError::io(error.to_string()))?;

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        let Ok(file_type) = entry.file_type().await else {
            continue;
        };

        let _ = if file_type.is_dir() {
            tokio::fs::remove_dir_all(&path).await
        } else {
            tokio::fs::remove_file(&path).await
        };
    }

    Ok(cleared)
}

pub fn bytes_to_mb(bytes: u64) -> f64 {
    bytes as f64 / 1_048_576.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let dir = std::env::temp_dir().join(format!(
            "theatlas-disk-{tag}-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn sums_files_across_nested_directories() {
        let dir = scratch("size");
        std::fs::write(dir.join("a.bin"), vec![0u8; 100]).unwrap();
        std::fs::create_dir_all(dir.join("nested/deeper")).unwrap();
        std::fs::write(dir.join("nested/b.bin"), vec![0u8; 50]).unwrap();
        std::fs::write(dir.join("nested/deeper/c.bin"), vec![0u8; 25]).unwrap();

        assert_eq!(dir_size_bytes(&dir).await, 175);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_missing_directory_measures_zero() {
        assert_eq!(dir_size_bytes(Path::new("/definitely/not/here")).await, 0);
    }

    #[tokio::test]
    async fn clearing_empties_the_directory_but_keeps_it() {
        let dir = scratch("clear");
        std::fs::write(dir.join("a.bin"), vec![0u8; 10]).unwrap();
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("sub/b.bin"), vec![0u8; 20]).unwrap();

        assert_eq!(clear_dir_contents(&dir).await.unwrap(), 30);
        assert!(dir.exists());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn clearing_a_missing_directory_is_not_an_error() {
        assert_eq!(
            clear_dir_contents(Path::new("/definitely/not/here"))
                .await
                .unwrap(),
            0
        );
    }

    #[test]
    fn megabytes_use_the_binary_unit() {
        assert_eq!(bytes_to_mb(1_048_576), 1.0);
    }
}
