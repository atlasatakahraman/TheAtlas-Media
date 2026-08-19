//! The job queue and dispatcher. The only stateful piece of `core::media` —
//! no Tauri types anywhere in this file, per the `core::tools::download`
//! convention of keeping the progress sink out of the module that owns state.

use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::watch;

use super::types::{
    ConvertSpec, DownloadSpec, JobId, JobKind, JobProgress, JobSnapshot, JobStatus,
};

pub enum JobSpec {
    Download(DownloadSpec),
    Convert(ConvertSpec),
}

struct JobEntry {
    snapshot: JobSnapshot,
    /// Taken by `try_start_next` the moment a job leaves the queue — a
    /// running job's arguments live in the driver's stack frame from then on,
    /// not here.
    spec: Option<JobSpec>,
    cancel_tx: Option<watch::Sender<bool>>,
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn title_for(spec: &JobSpec) -> String {
    match spec {
        JobSpec::Download(download) => download.title.clone(),
        JobSpec::Convert(convert) => Path::new(&convert.input_path)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| convert.input_path.clone()),
    }
}

fn kind_for(spec: &JobSpec) -> JobKind {
    match spec {
        JobSpec::Download(_) => JobKind::Download,
        JobSpec::Convert(_) => JobKind::Convert,
    }
}

/// FIFO queue plus a bounded-concurrency dispatcher.
///
/// Three `std::sync::Mutex`es, like `ProbeCache`: none is ever held across an
/// `.await`, and the compiler enforces that by making the command future
/// `!Send` the moment one is.
pub struct MediaEngine {
    registry: Mutex<HashMap<JobId, JobEntry>>,
    order: Mutex<VecDeque<JobId>>,
    next_id: AtomicU64,
    running: AtomicUsize,
    limit: AtomicUsize,
}

impl Default for MediaEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaEngine {
    pub fn new() -> Self {
        Self {
            registry: Mutex::new(HashMap::new()),
            order: Mutex::new(VecDeque::new()),
            next_id: AtomicU64::new(1),
            running: AtomicUsize::new(0),
            limit: AtomicUsize::new(2),
        }
    }

    /// Registers a new job as `Queued` and returns its id.
    ///
    /// Never starts anything itself — the caller (the command layer) calls
    /// `try_start_next` afterwards, which keeps "register a job" and "decide
    /// what runs next" as two separately testable steps.
    pub fn enqueue(&self, spec: JobSpec) -> JobId {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let snapshot = JobSnapshot {
            id,
            kind: kind_for(&spec),
            status: JobStatus::Queued,
            title: title_for(&spec),
            progress: JobProgress::default(),
            output_path: None,
            error: None,
            queued_at: now_unix_secs(),
            started_at: None,
            finished_at: None,
        };

        self.registry
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(
                id,
                JobEntry {
                    snapshot,
                    spec: Some(spec),
                    cancel_tx: None,
                },
            );
        self.order
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push_back(id);
        id
    }

    pub fn snapshot(&self, id: JobId) -> Option<JobSnapshot> {
        self.registry
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(&id)
            .map(|entry| entry.snapshot.clone())
    }

    /// Queued jobs (FIFO order) followed by running/finalizing ones, ordered
    /// by `queued_at`. Terminal jobs live in history, not here.
    pub fn list(&self) -> Vec<JobSnapshot> {
        let mut jobs: Vec<JobSnapshot> = self
            .registry
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .values()
            .filter(|entry| {
                !matches!(
                    entry.snapshot.status,
                    JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled
                )
            })
            .map(|entry| entry.snapshot.clone())
            .collect();
        jobs.sort_by_key(|job| job.queued_at);
        jobs
    }

    /// `Queued`: removed from `order` and marked `Cancelled` directly — it
    /// never had a `cancel_tx` because it never started. `Running`/
    /// `Finalizing`: signals its `cancel_tx`. Terminal or unknown: `false`.
    pub fn cancel(&self, id: JobId) -> bool {
        let status = {
            let registry = self.registry.lock().unwrap_or_else(|e| e.into_inner());
            match registry.get(&id) {
                Some(entry) => entry.snapshot.status,
                None => return false,
            }
        };

        match status {
            JobStatus::Queued => {
                self.order
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .retain(|queued_id| *queued_id != id);

                let mut registry = self.registry.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(entry) = registry.get_mut(&id) {
                    entry.snapshot.status = JobStatus::Cancelled;
                    entry.snapshot.finished_at = Some(now_unix_secs());
                    entry.spec = None;
                }
                true
            }
            JobStatus::Running | JobStatus::Finalizing => {
                let registry = self.registry.lock().unwrap_or_else(|e| e.into_inner());
                match registry.get(&id).and_then(|entry| entry.cancel_tx.clone()) {
                    Some(cancel_tx) => {
                        let _ = cancel_tx.send(true);
                        true
                    }
                    None => false,
                }
            }
            JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled => false,
        }
    }

    pub fn set_limit(&self, limit: usize) {
        self.limit.store(limit.clamp(1, 4), Ordering::Relaxed);
    }

    pub fn limit(&self) -> usize {
        self.limit.load(Ordering::Relaxed)
    }

    /// Mutates one job's snapshot in place under a single lock scope — every
    /// status/progress update in `commands::media::run_job` goes through
    /// this, never a raw `registry.lock()`.
    pub fn patch(&self, id: JobId, f: impl FnOnce(&mut JobSnapshot)) {
        if let Some(entry) = self
            .registry
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get_mut(&id)
        {
            f(&mut entry.snapshot);
        }
    }

    /// Pops the next queued job while `running < limit`, marks it `Running`,
    /// installs a fresh cancellation channel, and hands the spec to the
    /// caller to dispatch. Called in a loop by the command layer's
    /// `dispatch`, both right after an enqueue and again every time a running
    /// job finishes.
    pub fn try_start_next(&self) -> Option<(JobId, JobSpec, watch::Receiver<bool>)> {
        loop {
            if self.running.load(Ordering::Relaxed) >= self.limit.load(Ordering::Relaxed) {
                return None;
            }

            let id = self
                .order
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .pop_front()?;

            let mut registry = self.registry.lock().unwrap_or_else(|e| e.into_inner());
            let Some(entry) = registry.get_mut(&id) else {
                // Should not happen — an id only leaves `order` here or in
                // `cancel`, which removes it from both together — but a
                // vanished entry is not a reason to stop dispatching.
                continue;
            };

            // A job cancelled while still queued was already removed from
            // `order` by `cancel`, so reaching here with no spec means a
            // concurrent cancel raced this pop; skip it and keep going.
            let Some(spec) = entry.spec.take() else {
                continue;
            };

            let (cancel_tx, cancel_rx) = watch::channel(false);
            entry.cancel_tx = Some(cancel_tx);
            entry.snapshot.status = JobStatus::Running;
            entry.snapshot.started_at = Some(now_unix_secs());
            drop(registry);

            self.running.fetch_add(1, Ordering::Relaxed);
            return Some((id, spec, cancel_rx));
        }
    }

    /// Frees a concurrency slot. Does not itself pull the next job — the
    /// caller re-runs `dispatch` right after this, per `run_job`'s `finally`.
    pub fn mark_finished(&self, _id: JobId) {
        self.running.fetch_sub(1, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn download(url: &str) -> JobSpec {
        JobSpec::Download(DownloadSpec {
            url: url.to_string(),
            title: format!("Video {url}"),
            format_id: None,
            audio_only: false,
            output_dir: "C:\\out".to_string(),
        })
    }

    #[test]
    fn enqueue_lists_as_queued() {
        let engine = MediaEngine::new();
        let id = engine.enqueue(download("a"));
        let jobs = engine.list();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].id, id);
        assert_eq!(jobs[0].status, JobStatus::Queued);
    }

    #[test]
    fn try_start_next_respects_the_limit() {
        let engine = MediaEngine::new();
        engine.set_limit(1);
        let first = engine.enqueue(download("a"));
        let second = engine.enqueue(download("b"));

        let (started_id, _spec, _cancel_rx) =
            engine.try_start_next().expect("first job should start");
        assert_eq!(started_id, first);
        assert!(
            engine.try_start_next().is_none(),
            "limit of 1 already reached"
        );

        assert_eq!(engine.snapshot(second).unwrap().status, JobStatus::Queued);
    }

    #[test]
    fn mark_finished_frees_a_slot_for_the_next_job() {
        let engine = MediaEngine::new();
        engine.set_limit(1);
        let first = engine.enqueue(download("a"));
        let second = engine.enqueue(download("b"));

        let (id, _spec, _cancel_rx) = engine.try_start_next().expect("first job should start");
        assert_eq!(id, first);
        assert!(engine.try_start_next().is_none());

        engine.mark_finished(first);
        let (next_id, _spec, _cancel_rx) =
            engine.try_start_next().expect("slot freed for second job");
        assert_eq!(next_id, second);
    }

    #[test]
    fn cancelling_a_queued_job_never_touches_cancel_tx_and_removes_it_from_order() {
        let engine = MediaEngine::new();
        engine.set_limit(1);
        let first = engine.enqueue(download("a"));
        let second = engine.enqueue(download("b"));

        engine.try_start_next().expect("first job should start"); // running: first
        assert!(engine.cancel(second));
        assert_eq!(
            engine.snapshot(second).unwrap().status,
            JobStatus::Cancelled
        );

        // Freeing the slot must not resurrect the cancelled job — it was
        // already popped out of `order` by `cancel`, not merely skipped.
        engine.mark_finished(first);
        assert!(engine.try_start_next().is_none());
        assert!(!engine.list().iter().any(|job| job.id == second));
    }

    #[test]
    fn cancelling_a_running_job_signals_its_cancel_sender() {
        let engine = MediaEngine::new();
        let id = engine.enqueue(download("a"));
        let (_id, _spec, mut cancel_rx) = engine.try_start_next().expect("job should start");

        assert!(engine.cancel(id));
        assert!(*cancel_rx.borrow_and_update());
    }

    #[test]
    fn cancelling_a_terminal_or_unknown_job_returns_false() {
        let engine = MediaEngine::new();
        assert!(!engine.cancel(999));

        let id = engine.enqueue(download("a"));
        engine.patch(id, |snapshot| snapshot.status = JobStatus::Completed);
        assert!(!engine.cancel(id));
    }

    #[test]
    fn set_limit_clamps_to_one_through_four() {
        let engine = MediaEngine::new();
        engine.set_limit(0);
        assert_eq!(engine.limit(), 1);
        engine.set_limit(99);
        assert_eq!(engine.limit(), 4);
        engine.set_limit(3);
        assert_eq!(engine.limit(), 3);
    }
}
