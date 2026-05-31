# IPC decision table

| Use case | Mechanism |
|---|---|
| One-shot RPC, returns once | `#[tauri::command]` |
| Streaming progress for a known call | `ipc::Channel<T>` passed as a command argument |
| App-global broadcast (e.g., "extractor updated") | `Emitter::emit` + `listen` |
| Real-time sync (multiple subscribers, no caller) | `Emitter::emit` |

Rules:
- Every command returns `Result<T, CommandError>`. Never `String`.
- Channels are **ordered** and **fast** — use them for download/setup progress instead of `emit`.
- High-frequency channel sends must be **coalesced** to ≤ 10 events/s/download via the 100 ms `tokio::time::interval` pattern (Plan 05 §9) or `lib/coalesce.ts` on the FE.
- The Rust type lives in `src-tauri/src/contracts/`. `ts-rs` generates `lib/api-contracts.gen.ts`. Frontend imports from the generated file only — never directly from `../src-tauri/`.

Frontend invocation template:
```ts
import { Channel, invoke } from "@tauri-apps/api/core";
import type { DownloadEvent, DownloadId, DownloadRequest } from "@/lib/api-contracts.gen";

const channel = new Channel<DownloadEvent>();
channel.onmessage = handle;
const id = await invoke<DownloadId>("start_download", { request, onEvent: channel });
```
