# Skill: ipc::Channel with coalescing

Rust side (sender):
```rust
use tauri::ipc::Channel;
use tokio::sync::mpsc;
use std::time::Duration;

pub struct ProgressSink { tx: mpsc::Sender<RawProgress>, channel: Channel<DownloadEvent> }

impl ProgressSink {
    pub fn from_channel(channel: Channel<DownloadEvent>) -> Self {
        let (tx, mut rx) = mpsc::channel::<RawProgress>(64);
        let ch = channel.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_millis(100));
            let mut latest: Option<RawProgress> = None;
            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        if let Some(p) = latest.take() {
                            let _ = ch.send(DownloadEvent::Downloading {
                                id: p.id, downloaded: p.downloaded,
                                total: p.total, speed_bps: p.speed_bps,
                                eta_s: p.eta_s, percent: p.percent,
                                segments_done: p.segments_done,
                                segments_total: p.segments_total,
                            });
                        }
                    }
                    Some(p) = rx.recv() => { latest = Some(p); }
                    else => break,
                }
            }
        });
        Self { tx, channel }
    }

    pub fn try_send_progress(&self, p: RawProgress) { let _ = self.tx.try_send(p); }
    pub fn emit_terminal(&self, ev: DownloadEvent) { let _ = self.channel.send(ev); }
}
```

Terminal events bypass coalescing — send them directly via `emit_terminal`.

Frontend side (receiver):
```ts
import { Channel, invoke } from "@tauri-apps/api/core";

const channel = new Channel<DownloadEvent>();
channel.onmessage = (ev) => dispatch(ev);
const id = await invoke<DownloadId>("start_download", { request, onEvent: channel });
```
