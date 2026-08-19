//! Streaming a subprocess's stdout/stderr line by line, with cancellation.
//!
//! `probe::read_version` spawns and waits for a whole `Output` in one shot —
//! fine for a `--version` flag, useless for a multi-minute download that has
//! to report progress as it goes. This is the streaming counterpart: same
//! `kill_on_drop` + `CREATE_NO_WINDOW` spawn shape, but stdout and stderr are
//! read line by line as they arrive, and the child can be killed mid-run.

use std::path::Path;
use std::process::{ExitStatus, Stdio};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, watch};

use crate::error::{AppError, AppResult};

pub struct SpawnRequest<'a> {
    pub program: &'a Path,
    pub args: &'a [String],
}

#[derive(Clone, Copy)]
enum Stream {
    Stdout,
    Stderr,
}

/// Spawns `program`, reads stdout/stderr concurrently line by line, and races
/// the child's exit against `cancel_rx`.
///
/// Each stream is read into one `String` buffer reused across iterations
/// (`AsyncBufReadExt::read_line`, cleared with `buf.clear()` before every
/// read) rather than the `.lines()` adapter, which allocates a fresh `String`
/// per line — a multi-minute download at several ticks a second would
/// otherwise allocate thousands of short-lived strings for no reason.
///
/// On cancellation the child is killed via `child.start_kill()` (backed by
/// `kill_on_drop(true)` as a safety net if the future itself is dropped) and
/// this returns `Err(AppError::subprocess("cancelled"))`.
pub async fn spawn_streamed(
    request: SpawnRequest<'_>,
    mut cancel_rx: watch::Receiver<bool>,
    mut on_stdout_line: impl FnMut(&str) + Send + 'static,
    mut on_stderr_line: impl FnMut(&str) + Send + 'static,
) -> AppResult<ExitStatus> {
    let mut command = Command::new(request.program);
    command.args(request.args);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.kill_on_drop(true);

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|error| {
        AppError::subprocess(format!(
            "failed to run {}: {error}",
            request.program.display()
        ))
    })?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::internal("spawned process has no stdout pipe"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::internal("spawned process has no stderr pipe"))?;

    let (lines_tx, mut lines_rx) = mpsc::unbounded_channel::<(Stream, String)>();

    let stdout_tx = lines_tx.clone();
    let stdout_task = tokio::spawn(read_lines(stdout, Stream::Stdout, stdout_tx));
    let stderr_task = tokio::spawn(read_lines(stderr, Stream::Stderr, lines_tx));

    // `lines_rx.recv()` becomes immediately, repeatedly `Ready(None)` the
    // moment both reader tasks finish (their senders drop on EOF) — without
    // this guard that branch wins every `biased` poll forever, starving
    // `child.wait()` and hanging even after the child has already exited.
    let mut lines_closed = false;

    loop {
        tokio::select! {
            biased;

            changed = cancel_rx.changed() => {
                if changed.is_err() || *cancel_rx.borrow() {
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                    stdout_task.abort();
                    stderr_task.abort();
                    return Err(AppError::subprocess("cancelled"));
                }
            }

            line = lines_rx.recv(), if !lines_closed => {
                match line {
                    Some((Stream::Stdout, text)) => on_stdout_line(&text),
                    Some((Stream::Stderr, text)) => on_stderr_line(&text),
                    None => lines_closed = true,
                }
            }

            status = child.wait() => {
                let status = status.map_err(|error| {
                    AppError::subprocess(format!("could not wait for child process: {error}"))
                })?;
                // Drain whatever is left in the channel — the reader tasks may
                // have buffered a final line or two ahead of the exit.
                while let Ok((stream, text)) = lines_rx.try_recv() {
                    match stream {
                        Stream::Stdout => on_stdout_line(&text),
                        Stream::Stderr => on_stderr_line(&text),
                    }
                }
                return Ok(status);
            }
        }
    }
}

async fn read_lines<R>(reader: R, stream: Stream, tx: mpsc::UnboundedSender<(Stream, String)>)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut reader = BufReader::new(reader);
    let mut buf = String::new();
    loop {
        buf.clear();
        match reader.read_line(&mut buf).await {
            Ok(0) => return,
            Ok(_) => {
                let text = buf.trim_end_matches(['\r', '\n']);
                if tx.send((stream, text.to_string())).is_err() {
                    return;
                }
            }
            Err(_) => return,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    /// A genuine standalone executable, not a shell builtin — avoids
    /// `cmd.exe`'s `/C` indirection, which combined with `CREATE_NO_WINDOW`
    /// is known to hang under some parent-process/console configurations
    /// (no console handle to inherit, no new one requested).
    fn one_line_command() -> (&'static str, Vec<String>) {
        if cfg!(windows) {
            ("hostname", vec![])
        } else {
            ("sh", vec!["-c".to_string(), "echo hi".to_string()])
        }
    }

    fn sleep_command(secs: u64) -> (&'static str, Vec<String>) {
        if cfg!(windows) {
            (
                "ping",
                vec![
                    "-n".to_string(),
                    (secs + 1).to_string(),
                    "127.0.0.1".to_string(),
                ],
            )
        } else {
            ("sleep", vec![secs.to_string()])
        }
    }

    #[tokio::test]
    async fn streams_stdout_lines() {
        let (program, args) = one_line_command();
        let (_cancel_tx, cancel_rx) = watch::channel(false);
        let lines = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        let lines_clone = std::sync::Arc::clone(&lines);

        let status = tokio::time::timeout(
            Duration::from_secs(10),
            spawn_streamed(
                SpawnRequest {
                    program: Path::new(program),
                    args: &args,
                },
                cancel_rx,
                move |line| {
                    lines_clone
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .push(line.to_string())
                },
                |_| {},
            ),
        )
        .await
        .expect("spawn should not hang")
        .expect("command should succeed");

        assert!(status.success());
        let captured = lines.lock().unwrap_or_else(|e| e.into_inner());
        assert!(
            !captured.is_empty(),
            "should have captured at least one line of output"
        );
    }

    #[tokio::test]
    async fn cancellation_kills_before_natural_exit() {
        let (program, args) = sleep_command(5);
        let (cancel_tx, cancel_rx) = watch::channel(false);

        let canceller = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(200)).await;
            cancel_tx.send(true).expect("receiver still alive");
        });

        let started = std::time::Instant::now();
        let result = tokio::time::timeout(
            Duration::from_secs(3),
            spawn_streamed(
                SpawnRequest {
                    program: Path::new(program),
                    args: &args,
                },
                cancel_rx,
                |_| {},
                |_| {},
            ),
        )
        .await
        .expect("cancellation should not hang");

        canceller.await.expect("canceller task should not panic");

        assert!(result.is_err(), "cancelled spawn should return an error");
        assert!(
            started.elapsed() < Duration::from_secs(4),
            "killed well before the 5s sleep would finish"
        );
    }
}
