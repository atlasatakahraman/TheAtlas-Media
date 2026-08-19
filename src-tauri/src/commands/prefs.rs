//! Key/value preference commands.
//!
//! The backing store for the frontend's optimistic layer: a toggle paints
//! immediately, calls `kv_set`, and rolls back if this rejects it. Everything
//! interesting — namespace validation, atomic writes, debounced flushing —
//! is in `core::store::kv`; these are five adapters.
//!
//! Note that app-defined commands are *not* capability-gated in Tauri v2 (that
//! system covers core and plugin commands), so these need no
//! `capabilities/default.json` entry. They are still only reachable because
//! they appear in `generate_handler!`.

use std::collections::BTreeMap;

use serde_json::Value;

use crate::error::AppResult;
use crate::state::State;

/// One value, or `null` if it has never been set.
#[tauri::command]
pub async fn kv_get(state: State<'_>, namespace: String, key: String) -> AppResult<Option<Value>> {
    state.kv.get(&namespace, &key).await
}

/// Every pair in a namespace.
///
/// This is what a hook reads once on mount. One round trip for the whole
/// namespace beats one per key, and it is what makes a synchronous frame-0
/// read possible on the frontend.
#[tauri::command]
pub async fn kv_entries(state: State<'_>, namespace: String) -> AppResult<BTreeMap<String, Value>> {
    state.kv.entries(&namespace).await
}

#[tauri::command]
pub async fn kv_set(
    state: State<'_>,
    namespace: String,
    key: String,
    value: Value,
) -> AppResult<()> {
    state.kv.set(&namespace, &key, value).await
}

/// Shallow-merge several keys at once.
#[tauri::command]
pub async fn kv_patch(
    state: State<'_>,
    namespace: String,
    values: BTreeMap<String, Value>,
) -> AppResult<()> {
    state.kv.patch(&namespace, values).await
}

/// Returns whether the key was there to begin with.
#[tauri::command]
pub async fn kv_delete(state: State<'_>, namespace: String, key: String) -> AppResult<bool> {
    state.kv.delete(&namespace, &key).await
}
