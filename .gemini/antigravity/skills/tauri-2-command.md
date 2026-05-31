# Skill: Tauri 2 command boilerplate

When writing a `#[tauri::command]`:

```rust
use tauri::State;
use crate::contracts::error::CommandError;

#[tauri::command]
pub async fn <name>(
    args: <ArgStruct>,
    state: State<'_, crate::AppState>,
) -> Result<<ReturnType>, CommandError> {
    state.service.<method>(args).await
}
```

Rules:
- Always `async fn`. Synchronous commands block the event loop.
- Return type: `Result<T, CommandError>` — never `String`, never `()` (use `Ok(())`).
- Argument types must `Deserialize + ts_rs::TS`.
- Return types must `Serialize + ts_rs::TS`.
- Register in `lib.rs` `invoke_handler(tauri::generate_handler![...])`.

For commands that stream:
```rust
#[tauri::command]
pub async fn <name>(
    args: <ArgStruct>,
    on_event: tauri::ipc::Channel<<EventEnum>>,
    state: State<'_, crate::AppState>,
) -> Result<<ReturnType>, CommandError> {
    state.service.<method>(args, ProgressSink::from_channel(on_event)).await
}
```

`ProgressSink::from_channel` wraps with the 100 ms coalescer (Plan 05 §9).
