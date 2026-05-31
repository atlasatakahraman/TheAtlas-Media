# Goal

TheAtlas Media Processing, or TheAtlas Media for short, aims to be a high-performance desktop app for downloading, extracting, and converting media with a responsive Next.js/React frontend and a Rust-powered Tauri backend.

## Primary goals

- Use the Rust backend for process-heavy work such as download orchestration, filesystem access, validation, and cancellation.
- Integrate `yt-dlp` safely as a managed backend process rather than invoking it from the frontend.
- Keep the React UI responsive during long-running downloads by streaming structured progress events from Rust.
- Follow current React rendering performance guidance: keep high-frequency state local, avoid unnecessary cascading renders, and add memoization only where profiling shows value.
- Provide clear user-facing errors for missing dependencies, invalid URLs, failed downloads, and invalid output paths.

## Success criteria

- Users can start, monitor, complete, fail, and cancel downloads from the app.
- The backend controls command arguments, output paths, and dependency detection.
- The frontend remains responsive while multiple downloads are active.
- The app avoids shell interpolation and raw user-provided `yt-dlp` flags.
- Documentation and implementation stay aligned with `YT_DLP_RUST_BACKEND.md`.
