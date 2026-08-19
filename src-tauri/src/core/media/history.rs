//! Persisted, capped job history — one JSON file, following the same
//! typed-JSON pattern as `core::tools::verify::ArtifactJournal`
//! (`state::read_json_or_default` / `state::write_json`).
//!
//! Only terminal snapshots (`Completed | Failed | Cancelled`) are appended,
//! by the dispatcher in `commands::media`, after the job leaves the live
//! queue. The live queue (`MediaEngine::list()`) and this history are two
//! different sources; `/files/queue` renders both, live jobs first.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::types::JobSnapshot;
use crate::error::AppResult;
use crate::state::{read_json_or_default, write_json};

/// Oldest entries beyond this are dropped on every append — generous for
/// real use, and short enough that the file never becomes the thing that
/// makes `/files/queue` slow to load.
const MAX_ENTRIES: usize = 200;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MediaHistory {
    /// Newest first.
    pub entries: Vec<JobSnapshot>,
}

pub async fn load(path: &Path) -> MediaHistory {
    read_json_or_default(path).await
}

pub async fn append_entry(path: &Path, entry: JobSnapshot) -> AppResult<()> {
    let mut history = load(path).await;
    history.entries.insert(0, entry);
    history.entries.truncate(MAX_ENTRIES);
    write_json(path, &history).await
}

pub async fn clear(path: &Path) -> AppResult<()> {
    write_json(path, &MediaHistory::default()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::media::types::{JobKind, JobProgress, JobStatus};
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn tempdir() -> std::path::PathBuf {
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "theatlas-media-history-test-{}-{}",
            std::process::id(),
            id
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn snapshot(id: u64, status: JobStatus) -> JobSnapshot {
        JobSnapshot {
            id,
            kind: JobKind::Download,
            status,
            title: format!("Job {id}"),
            progress: JobProgress::default(),
            output_path: None,
            error: None,
            queued_at: id,
            started_at: None,
            finished_at: Some(id),
        }
    }

    #[tokio::test]
    async fn append_prepends_and_loads_back() {
        let dir = tempdir();
        let path = dir.join("history.json");

        append_entry(&path, snapshot(1, JobStatus::Completed))
            .await
            .unwrap();
        append_entry(&path, snapshot(2, JobStatus::Failed))
            .await
            .unwrap();

        let history = load(&path).await;
        assert_eq!(history.entries.len(), 2);
        assert_eq!(history.entries[0].id, 2, "newest first");
        assert_eq!(history.entries[1].id, 1);
    }

    #[tokio::test]
    async fn append_caps_at_max_entries() {
        let dir = tempdir();
        let path = dir.join("history.json");

        for i in 0..(MAX_ENTRIES as u64 + 10) {
            append_entry(&path, snapshot(i, JobStatus::Completed))
                .await
                .unwrap();
        }

        let history = load(&path).await;
        assert_eq!(history.entries.len(), MAX_ENTRIES);
        assert_eq!(
            history.entries[0].id,
            MAX_ENTRIES as u64 + 9,
            "newest survives"
        );
    }

    #[tokio::test]
    async fn clear_empties_the_file() {
        let dir = tempdir();
        let path = dir.join("history.json");
        append_entry(&path, snapshot(1, JobStatus::Completed))
            .await
            .unwrap();

        clear(&path).await.unwrap();
        assert!(load(&path).await.entries.is_empty());
    }

    #[tokio::test]
    async fn load_of_a_missing_file_is_empty() {
        let dir = tempdir();
        let path = dir.join("does-not-exist.json");
        assert!(load(&path).await.entries.is_empty());
    }
}
