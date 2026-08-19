//! A small namespaced key/value store, persisted as JSON.
//!
//! This is what the frontend's optimistic layer writes through: a favourite
//! toggles instantly in the UI and lands here a moment later. Three properties
//! matter for that to be safe.
//!
//! **Atomic writes.** Every flush goes to a sibling `.tmp` and is renamed over
//! the real file. A power cut during a write leaves either the old file or the
//! new one, never a truncated one — the failure mode that turns "I lost a
//! setting" into "the app will not start".
//!
//! **Debounced flushes.** Dragging a slider produces a write per frame. Each
//! one marks the namespace dirty and schedules a flush; only the last one in a
//! quiet window actually touches the disk.
//!
//! **Namespace validation.** A namespace becomes a file name, so it is checked
//! against a strict character set before it is joined to anything. `../../` in
//! a namespace would otherwise be a write-anywhere primitive reachable from
//! the webview — exactly the path-traversal shape the security notes call the
//! most common real-world Tauri fs bypass.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::sync::{Mutex, Notify};

use crate::error::{AppError, AppResult};

/// How long a namespace stays dirty before it is written.
const FLUSH_DEBOUNCE: Duration = Duration::from_millis(400);

/// Longest accepted namespace or key. Generous for real use, short enough that
/// no path length limit is ever the thing that fails.
const MAX_NAME_LEN: usize = 64;

#[derive(Debug, Default)]
struct Namespace {
    values: BTreeMap<String, Value>,
    dirty: bool,
}

pub struct KvStore {
    root: PathBuf,
    /// `tokio::sync::Mutex` because the guard is deliberately held across the
    /// small file read and write below. Those are millisecond operations on a
    /// few kilobytes; holding the lock removes a load/write race entirely, and
    /// the lock-scope rule the vault sets is about *slow* awaits — network and
    /// subprocess — not about all of them.
    namespaces: Mutex<HashMap<String, Namespace>>,
    /// Raised by every mutation and consumed by [`KvStore::run_flush_loop`].
    /// `Notify` rather than a polling timer so an idle app does no work at
    /// all, and rather than a task spawned per write so `set` stays callable
    /// outside a runtime.
    dirty: Notify,
    debounce: Duration,
}

impl KvStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            namespaces: Mutex::new(HashMap::new()),
            dirty: Notify::new(),
            debounce: FLUSH_DEBOUNCE,
        }
    }

    /// A store that writes immediately. Tests only — a debounce that has to be
    /// slept through makes every assertion racy.
    #[cfg(test)]
    fn immediate(root: impl Into<PathBuf>) -> Self {
        Self {
            debounce: Duration::ZERO,
            ..Self::new(root)
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    // -- Reads ---------------------------------------------------------------

    pub async fn get(&self, namespace: &str, key: &str) -> AppResult<Option<Value>> {
        validate_name("key", key)?;
        let mut guard = self.namespaces.lock().await;
        let entry = self.load_into(&mut guard, namespace).await?;
        Ok(entry.values.get(key).cloned())
    }

    /// Every pair in a namespace. This is what a hook reads once on mount,
    /// rather than one IPC round-trip per key.
    pub async fn entries(&self, namespace: &str) -> AppResult<BTreeMap<String, Value>> {
        let mut guard = self.namespaces.lock().await;
        let entry = self.load_into(&mut guard, namespace).await?;
        Ok(entry.values.clone())
    }

    // -- Writes --------------------------------------------------------------

    pub async fn set(&self, namespace: &str, key: &str, value: Value) -> AppResult<()> {
        validate_name("key", key)?;
        {
            let mut guard = self.namespaces.lock().await;
            let entry = self.load_into(&mut guard, namespace).await?;
            entry.values.insert(key.to_string(), value);
            entry.dirty = true;
        }
        self.dirty.notify_one();
        Ok(())
    }

    /// Shallow-merge an object's fields into a namespace. Absent from the
    /// patch means unchanged, `null` means set-to-null — not delete, which is
    /// what `delete` is for.
    pub async fn patch(&self, namespace: &str, patch: BTreeMap<String, Value>) -> AppResult<()> {
        for key in patch.keys() {
            validate_name("key", key)?;
        }
        {
            let mut guard = self.namespaces.lock().await;
            let entry = self.load_into(&mut guard, namespace).await?;
            entry.values.extend(patch);
            entry.dirty = true;
        }
        self.dirty.notify_one();
        Ok(())
    }

    /// Returns whether the key was there to begin with.
    pub async fn delete(&self, namespace: &str, key: &str) -> AppResult<bool> {
        validate_name("key", key)?;
        let removed = {
            let mut guard = self.namespaces.lock().await;
            let entry = self.load_into(&mut guard, namespace).await?;
            let removed = entry.values.remove(key).is_some();
            entry.dirty |= removed;
            removed
        };
        if removed {
            self.dirty.notify_one();
        }
        Ok(removed)
    }

    /// Empty a namespace and remove its file.
    pub async fn clear(&self, namespace: &str) -> AppResult<()> {
        let path = self.namespace_path(namespace)?;
        {
            let mut guard = self.namespaces.lock().await;
            let entry = self.load_into(&mut guard, namespace).await?;
            entry.values.clear();
            entry.dirty = false;
        }
        match tokio::fs::remove_file(&path).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(AppError::io(error.to_string())),
        }
    }

    // -- Flushing ------------------------------------------------------------

    /// Write a namespace now, if it is dirty.
    pub async fn flush(&self, namespace: &str) -> AppResult<()> {
        let path = self.namespace_path(namespace)?;

        let mut guard = self.namespaces.lock().await;
        let Some(entry) = guard.get_mut(namespace) else {
            return Ok(());
        };
        if !entry.dirty {
            return Ok(());
        }

        let body = serde_json::to_vec_pretty(&entry.values)?;
        // Cleared only after the write lands, so a failed flush stays queued
        // for the next one rather than silently dropping the change.
        write_atomically(&path, &body).await?;
        entry.dirty = false;
        Ok(())
    }

    /// Write every dirty namespace. Called on shutdown so a pending debounce
    /// cannot be lost when the window closes.
    pub async fn flush_all(&self) -> AppResult<()> {
        let dirty: Vec<String> = {
            let guard = self.namespaces.lock().await;
            guard
                .iter()
                .filter(|(_, entry)| entry.dirty)
                .map(|(name, _)| name.clone())
                .collect()
        };

        for namespace in dirty {
            self.flush(&namespace).await?;
        }
        Ok(())
    }

    /// The debounced writer. Spawned once, during app setup.
    ///
    /// Waits for a mutation, then waits out the debounce before writing, so a
    /// burst of fifty writes in one drag becomes one file write. `Notify`
    /// stores a permit when nothing is waiting, so a mutation that lands
    /// mid-flush wakes the very next iteration instead of being lost.
    pub async fn run_flush_loop(self: Arc<Self>) {
        loop {
            self.dirty.notified().await;

            if !self.debounce.is_zero() {
                tokio::time::sleep(self.debounce).await;
            }

            if let Err(error) = self.flush_all().await {
                log::warn!("kv: flush failed: {error}");
            }
        }
    }

    // -- Internals -----------------------------------------------------------

    fn namespace_path(&self, namespace: &str) -> AppResult<PathBuf> {
        validate_name("namespace", namespace)?;
        Ok(self.root.join(format!("{namespace}.json")))
    }

    /// Get a namespace, reading it from disk the first time it is touched.
    ///
    /// A missing or unreadable file yields an empty namespace rather than an
    /// error: a corrupt prefs file should cost the user their preferences, not
    /// their ability to open the app.
    async fn load_into<'a>(
        &self,
        guard: &'a mut HashMap<String, Namespace>,
        namespace: &str,
    ) -> AppResult<&'a mut Namespace> {
        let path = self.namespace_path(namespace)?;

        if !guard.contains_key(namespace) {
            let values = match tokio::fs::read(&path).await {
                Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|error| {
                    log::warn!("kv: '{namespace}' is not valid JSON, starting empty: {error}");
                    BTreeMap::new()
                }),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
                Err(error) => {
                    log::warn!("kv: cannot read '{namespace}', starting empty: {error}");
                    BTreeMap::new()
                }
            };

            guard.insert(
                namespace.to_string(),
                Namespace {
                    values,
                    dirty: false,
                },
            );
        }

        Ok(guard.get_mut(namespace).expect("just inserted when absent"))
    }
}

/// Write via a temp file and a rename, so a reader never sees a half-file.
async fn write_atomically(path: &Path, body: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let temp = path.with_extension("json.tmp");
    tokio::fs::write(&temp, body).await?;

    if let Err(error) = tokio::fs::rename(&temp, path).await {
        let _ = tokio::fs::remove_file(&temp).await;
        return Err(AppError::io(error.to_string()));
    }

    Ok(())
}

/// Namespaces and keys come from the webview and namespaces become file names.
/// Anything outside `[A-Za-z0-9._-]` is refused rather than sanitized, because
/// silently rewriting a name means two different names can collide on one file.
fn validate_name(what: &str, name: &str) -> AppResult<()> {
    if name.is_empty() {
        return Err(AppError::validation(format!("{what} must not be empty")));
    }
    if name.len() > MAX_NAME_LEN {
        return Err(AppError::validation(format!(
            "{what} must be at most {MAX_NAME_LEN} characters"
        )));
    }
    // Rejected explicitly rather than by the character set alone, so the error
    // says what is actually wrong with `..`.
    if name == "." || name == ".." {
        return Err(AppError::validation(format!(
            "'{name}' is not a valid {what}"
        )));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err(AppError::validation(format!(
            "{what} may only contain letters, digits, '.', '_' and '-'"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn scratch(tag: &str) -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);

        let dir = std::env::temp_dir().join(format!(
            "theatlas-kv-{tag}-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn set_then_get_round_trips() {
        let dir = scratch("roundtrip");
        let store = Arc::new(KvStore::immediate(&dir));

        store.set("prefs", "theme", json!("dark")).await.unwrap();
        assert_eq!(
            store.get("prefs", "theme").await.unwrap(),
            Some(json!("dark"))
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn values_survive_a_new_store_over_the_same_directory() {
        let dir = scratch("persist");
        {
            let store = Arc::new(KvStore::immediate(&dir));
            store.set("prefs", "volume", json!(0.8)).await.unwrap();
            store.flush("prefs").await.unwrap();
        }

        let reopened = Arc::new(KvStore::immediate(&dir));
        assert_eq!(
            reopened.get("prefs", "volume").await.unwrap(),
            Some(json!(0.8))
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn patch_merges_rather_than_replaces() {
        let dir = scratch("patch");
        let store = Arc::new(KvStore::immediate(&dir));

        store.set("prefs", "a", json!(1)).await.unwrap();
        store
            .patch("prefs", BTreeMap::from([("b".to_string(), json!(2))]))
            .await
            .unwrap();

        let all = store.entries("prefs").await.unwrap();
        assert_eq!(all.get("a"), Some(&json!(1)));
        assert_eq!(all.get("b"), Some(&json!(2)));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn delete_reports_whether_the_key_existed() {
        let dir = scratch("delete");
        let store = Arc::new(KvStore::immediate(&dir));

        store.set("prefs", "gone", json!(true)).await.unwrap();
        assert!(store.delete("prefs", "gone").await.unwrap());
        assert!(!store.delete("prefs", "gone").await.unwrap());
        assert_eq!(store.get("prefs", "gone").await.unwrap(), None);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn namespaces_do_not_leak_into_each_other() {
        let dir = scratch("isolation");
        let store = Arc::new(KvStore::immediate(&dir));

        store.set("one", "k", json!("a")).await.unwrap();
        store.set("two", "k", json!("b")).await.unwrap();

        assert_eq!(store.get("one", "k").await.unwrap(), Some(json!("a")));
        assert_eq!(store.get("two", "k").await.unwrap(), Some(json!("b")));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_traversing_namespace_is_refused() {
        let dir = scratch("traversal");
        let store = Arc::new(KvStore::immediate(&dir));

        for bad in ["../escape", "..", ".", "a/b", "a\\b", ""] {
            let error = store.set(bad, "k", json!(1)).await.unwrap_err();
            assert_eq!(error.kind(), "validation", "accepted namespace {bad:?}");
        }

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_traversing_key_is_refused() {
        let dir = scratch("keytraversal");
        let store = Arc::new(KvStore::immediate(&dir));

        let error = store.set("prefs", "../evil", json!(1)).await.unwrap_err();
        assert_eq!(error.kind(), "validation");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn an_overlong_name_is_refused() {
        let dir = scratch("long");
        let store = Arc::new(KvStore::immediate(&dir));

        let long = "x".repeat(MAX_NAME_LEN + 1);
        assert_eq!(
            store.set(&long, "k", json!(1)).await.unwrap_err().kind(),
            "validation"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_corrupt_file_yields_an_empty_namespace_not_a_failure() {
        let dir = scratch("corrupt");
        std::fs::write(dir.join("prefs.json"), b"{ not json at all").unwrap();

        let store = Arc::new(KvStore::immediate(&dir));
        assert!(store.entries("prefs").await.unwrap().is_empty());

        // And it must be writable again afterwards.
        store.set("prefs", "k", json!(1)).await.unwrap();
        assert_eq!(store.get("prefs", "k").await.unwrap(), Some(json!(1)));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn flushing_leaves_no_temp_file_behind() {
        let dir = scratch("tmp");
        let store = Arc::new(KvStore::immediate(&dir));

        store.set("prefs", "k", json!(1)).await.unwrap();
        store.flush("prefs").await.unwrap();

        assert!(dir.join("prefs.json").exists());
        assert!(!dir.join("prefs.json.tmp").exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn clear_empties_the_namespace_and_removes_the_file() {
        let dir = scratch("clear");
        let store = Arc::new(KvStore::immediate(&dir));

        store.set("prefs", "k", json!(1)).await.unwrap();
        store.flush("prefs").await.unwrap();
        store.clear("prefs").await.unwrap();

        assert!(store.entries("prefs").await.unwrap().is_empty());
        assert!(!dir.join("prefs.json").exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn flush_all_writes_every_dirty_namespace() {
        let dir = scratch("flushall");
        let store = Arc::new(KvStore::immediate(&dir));

        store.set("one", "k", json!(1)).await.unwrap();
        store.set("two", "k", json!(2)).await.unwrap();
        store.flush_all().await.unwrap();

        assert!(dir.join("one.json").exists());
        assert!(dir.join("two.json").exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_burst_of_writes_collapses_to_one_disk_write() {
        // The debounce is the reason optimistic UI can write on every frame.
        let dir = scratch("debounce");
        let store = Arc::new(KvStore::new(&dir));
        tokio::spawn(Arc::clone(&store).run_flush_loop());

        for index in 0..50 {
            store.set("prefs", "counter", json!(index)).await.unwrap();
        }

        // Still nothing on disk: the loop is waiting out the debounce.
        assert!(!dir.join("prefs.json").exists());

        tokio::time::sleep(FLUSH_DEBOUNCE + Duration::from_millis(400)).await;

        let written = std::fs::read_to_string(dir.join("prefs.json")).unwrap();
        assert!(written.contains("49"), "last write should win: {written}");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn a_write_during_a_flush_is_not_lost() {
        // `Notify` keeps one permit when nobody is waiting, so a mutation that
        // arrives while the loop is mid-flush wakes it again immediately.
        let dir = scratch("nolost");
        let store = Arc::new(KvStore::new(&dir));
        tokio::spawn(Arc::clone(&store).run_flush_loop());

        store.set("prefs", "first", json!(1)).await.unwrap();
        tokio::time::sleep(FLUSH_DEBOUNCE + Duration::from_millis(400)).await;

        store.set("prefs", "second", json!(2)).await.unwrap();
        tokio::time::sleep(FLUSH_DEBOUNCE + Duration::from_millis(400)).await;

        let written = std::fs::read_to_string(dir.join("prefs.json")).unwrap();
        assert!(
            written.contains("second"),
            "second write never landed: {written}"
        );

        std::fs::remove_dir_all(&dir).ok();
    }
}
