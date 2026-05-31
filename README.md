# TheAtlas Media Processing

A high-performance desktop app for downloading, extracting, and converting media — Next.js frontend, Rust backend.

![License](https://img.shields.io/badge/License-AAKNCL_v1.0-gray)
![Tech](https://img.shields.io/badge/Tech-Next.js_16.2.6_|_React_19.2_|_Tauri_2.11_|_Rust_1.89-blue)
![Status](https://img.shields.io/badge/Status-Phase_0_complete-green)
[![CI](https://github.com/atlasatakahraman/TheAtlas-Media/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)

## Overview

TheAtlas Media is a dedicated desktop application for downloading, extracting, and converting media files. It is strictly designed for personal, educational, and non-commercial use. The architecture clearly separates concerns: the Rust backend exclusively handles process-heavy work like orchestrating downloads and invoking binaries, while the Next.js 16 frontend focuses purely on responsive UI and state management (see [docs/adr/ADR-005](./docs/adr/ADR-005-yt-dlp-crate-pivot.md), [ADR-006](./docs/adr/ADR-006-src-directory-layout.md)).

## Status

- **Phase 0 complete** (see [CHANGELOG.md](./documentation/CHANGELOG.md)): Plans 01-09, ADR-005 and ADR-006, CI workflows, lint/format gates, Rust 1.89 toolchain pin, working dev environment.
- **Phase 1 next**: scaffold IPC contracts and the ExtractorBackend trait (see [plans/05_YT_DLP_RUST_BACKEND_PLAN.md](./plans/05_YT_DLP_RUST_BACKEND_PLAN.md)).

See [plans/README.md](./plans/README.md) for the full project roadmap.

## Tech stack

| Layer | Tech | Version |
|---|---|---|
| Frontend framework | Next.js | 16.2.6 |
| React | React / ReactDOM | 19.2.4 |
| Bundler | Turbopack | (Next.js default) |
| Styling | Tailwind CSS | v4 |
| UI primitives | shadcn/ui | 4.8.2 |
| Desktop runtime | Tauri | 2.11.2 |
| Backend | Rust | 1.89 |
| Toolchain | Node | ≥ 20.9 |
| Package manager | pnpm | 10.33.4 |
| Media extractor | boul2gom yt-dlp crate | v2.7.x |

## Prerequisites

- **Node** ≥ 20.9
- **pnpm** 10.33.4
- **Rust** ≥ 1.89 (Pinned for Tauri 2.11's transitive MSRV dependencies)
- **Linux system dependencies** (Ubuntu/Debian):
  ```bash
  sudo apt-get update
  sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev build-essential
  ```
  *(macOS and Windows require no additional system dependencies).*

## Getting started

1. Clone the repository:
   ```bash
   git clone https://github.com/atlasatakahraman/TheAtlas-Media.git
   cd TheAtlas-Media
   ```

2. Install Node dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```

3. Run the development environment:
   ```bash
   pnpm tauri:dev
   ```

4. Build the release bundle:
   ```bash
   pnpm tauri:build
   ```

## Project layout

```text
.
├── src/                    # Next.js App Router (D11: src/ layout)
│   ├── app/                # Application routes
│   ├── components/         # UI (shadcn under ui/, app-specific elsewhere)
│   ├── hooks/              # Custom React hooks
│   ├── layout/             # App shell layouts
│   └── lib/                # Utility functions
├── src-tauri/              # Rust backend
│   ├── src/                # Command handlers (Phase 1+)
│   └── capabilities/       # Tauri 2.x permission scopes
├── plans/                  # Project execution plans
├── docs/adr/               # Architecture Decision Records
├── documentation/          # Source-of-truth docs (GOAL, ANIMATION, etc.)
├── .gemini/antigravity/    # Antigravity workspace config (KB, skills, agent definitions)
└── .github/workflows/      # CI: ci, security-audit, license, agents-doc-drift, pr-labeler
```

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start the Next.js development server (frontend only) |
| `pnpm build` | Build the Next.js application for production export |
| `pnpm lint` | Run ESLint checks against the frontend codebase |
| `pnpm tauri:dev` | Start the Tauri backend and Next.js frontend in dev mode |
| `pnpm tauri:build` | Build the standalone Tauri application bundle |
| `scripts/check-compat.sh` | Verify the Rust toolchain version compatibility |
| `scripts/check-agents-rules.sh` | Verify Next.js doc stamps and root `/app` guardrail |
| `scripts/check-animation-rules.sh` | Enforce performance-friendly animation rules |

## Contributing

- **Execution Plans:** Our plans govern the architecture and live in `plans/`. Read [plans/README.md](./plans/README.md) first.
- **Pull Requests:** PRs require the `.github/pull_request_template.md` checklist to be completely filled out.
- **Locked Decisions:** (D1–D11) are outlined in `plans/README.md` "Cross-cutting decisions". You must cite the authorizing D-number that justifies your change in your PR description.
- **Frontend Guidelines:** Before making any `.tsx` changes, strictly follow the Next.js 16 pre-flight protocol defined in `plans/02_AGENTS_PLAN.md` §3.

## License

This project is licensed under the **Atlas Ata Kahraman Non-Commercial License v1.0 (AAKNCL)** — see [LICENSE.md](./LICENSE.md).

> Based on work by Atlas Ata KAHRAMAN (atlasfirarda) — https://github.com/atlasatakahraman

**Personal, educational, and non-commercial use is free.**
Commercial use (selling, SaaS, paid features, bundling into a commercial product) requires a separate commercial license.

### Commercial licensing
Email: **atlasatakahraman.com@gmail.com**

## Third-party notices

Bundled binaries (yt-dlp + ffmpeg) are managed by the boul2gom yt-dlp crate; FFmpeg ships under LGPL 2.1+; details in [docs/adr/ADR-005-yt-dlp-crate-pivot.md](./docs/adr/ADR-005-yt-dlp-crate-pivot.md) and (when implemented) `src-tauri/resources/LICENSES/`. `docs/THIRD_PARTY_LICENSES.md` will be generated by Plan 08 / Phase 4.

## Acknowledgements

Special thanks to shadcn/ui, Radix UI, Tauri, Next.js, and the boul2gom yt-dlp crate for providing the excellent foundational layers of this application.
