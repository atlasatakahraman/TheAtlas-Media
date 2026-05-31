# Plan 09 — Antigravity 2.0 Execution Plan for Gemini 3.1 Pro (High)

> **Target environment:** Google Antigravity 2.0 desktop app (May 2026 release).
> **Driver model:** Gemini 3.1 Pro with `thinking_level: HIGH`.
> **Worker model:** Gemini 3.5 Flash for high-throughput / parallel subagents.
> **Repo state at start:** `theatlas-media`, plans 01–08 written, no `src-tauri/src/` code yet.
> **License gate:** AAKNCL v1.0 — every agent must respect Plan 08 attribution rules.

This plan turns the eight strategic plans into an **executable agent workflow** inside Antigravity 2.0. It assigns the right model to the right phase, defines the **Manager Surface** layout, names the **subagents**, configures the **Knowledge Base** and **Skills**, and lists every **Artifact** required before each merge gate.

---

## 1. Why Gemini 3.1 Pro (High) for *this* repo

| Capability | Why it matters here |
|---|---|
| **1 M-token context** | Plans 01–08 (~106 KB) + `documentation/` (~50 KB) + `node_modules/next/dist/docs/` excerpts + relevant Rust crate docs fit into a *single* working context. No retrieval roulette. |
| **`thinking_level: HIGH`** | Plan 05 §7 cancellation semantics, capability JSON regex validators, IPC type round-tripping, AAKNCL compliance — all are areas where high-reasoning beats throughput. |
| **`thought_signature` passthrough** | Mandatory for multi-turn tool calls in Gemini 3.x — must be enabled in the subagent harness, otherwise tool-using agents 400-error on the second turn. |
| **Top-tier coding/agent benchmarks** | 80.6 % SWE-Bench Verified is enough for the Rust/Tauri/Next 16 surface area we're driving. |
| **Long-context attention is still partial at 1 M** | MRCR-v2 (1 M, pointwise) ~ 26 % — so we still **chunk** by plan and use **Knowledge Base** for cross-plan reference rather than dumping everything every turn. |

**Decision:** use **Gemini 3.1 Pro (High)** for *architecture, planning, security-sensitive code, IPC contracts, license compliance*. Use **Gemini 3.5 Flash** for *file-by-file scaffolds, test boilerplate, formatting, parallel subagent fan-out*. Switch with `/model` mid-session.

---

## 2. Antigravity workspace bootstrap

### 2.1 Workspace settings (one-time)

In the Antigravity desktop app:

1. **Open** the `theatlas-media` repo as the workspace root.
2. **Manager Surface → Settings → Models**
   - Primary: `gemini-3.1-pro` · thinking: `HIGH`
   - Default subagent: `gemini-3.5-flash` · thinking: `medium` (Flash default)
   - Fallbacks (in order): Claude Sonnet 4.5 → GPT-OSS (only on Gemini quota exhaustion)
3. **Manager Surface → Settings → Permissions**
   - Terminal: **allow** `pnpm`, `cargo`, `git`, `node`, `npx`, `tauri`, `rg`, `fd`, `jq` (path-allow­listed)
   - File writes: **scoped** to `src/app/`, `src/components/`, `src/lib/`, `src-tauri/src/`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/`, `src-tauri/tauri.conf.json`, `documentation/`, `docs/adr/`, `plans/`, `tests/`, `.github/`
   - **Deny** writes to `LICENSE`, `package.json` (manual review only — Plan 08 / Plan 02), `pnpm-lock.yaml`
   - Browser sub-agent: **allow** `localhost:3000`, `https://docs.rs`, `https://v2.tauri.app`, `https://nextjs.org`, `https://github.com/{tauri-apps,vercel,boul2gom}`. Deny everything else.
4. **Manager Surface → Settings → Artifacts**
   - Plans: **required** for every task
   - Walkthroughs: **required** for any change touching `src-tauri/capabilities/`, `tauri.conf.json`, or `src/lib/api-contracts.gen.ts`
   - Screenshots: **required** for any change touching `src/app/` or `src/components/`
   - Browser recordings: **required** for any change touching `src/src/app/setup/` or `src/src/app/downloads/`

### 2.2 Knowledge Base (`.gemini/antigravity/knowledge/`)

Antigravity reads markdown from this directory automatically. Seed it with the *high-signal* slices:

```
.gemini/antigravity/knowledge/
├─ 00_ground_truth.md          # which doc beats which, conflict resolution rules
├─ 01_locked_decisions.md      # copy of plans/README.md "Cross-cutting decisions" table
├─ 02_agents_preflight.md      # copy of plans/02_AGENTS_PLAN.md §3 (the protocol)
├─ 03_ipc_pattern.md           # plans/03_CLAUDE_PLAN.md §4 (Command/Channel/Event)
├─ 04_animation_contract.md    # plans/07_ANIMATION_PLAN.md §1 (R1–R4)
├─ 05_yt_dlp_crate_api.md      # condensed boul2gom API surface: Downloader, LibraryInstaller, hooks
├─ 06_license_attribution.md   # AAKNCL header block + commercial-license email
└─ 07_glossary.md              # DownloadId, FormatPreset, ExtractorBackend, CommandError, …
```

> The Knowledge Base is loaded on every agent spawn — keep each file ≤ 2 KB so the primary task context isn't pre-burned. Detailed plans stay in `plans/` and are fetched on demand by the agent's file-read tool.

### 2.3 Skills (`.gemini/antigravity/skills/`)

Custom skills (40+-skill-style "context-aware knowledge packs") for repeated patterns:

| Skill file | Purpose | Loaded by |
|---|---|---|
| `tauri-2-command.md` | Boilerplate for `#[tauri::command] async fn ... -> Result<T, CommandError>` + `ts-rs` derive | Rust subagents |
| `tauri-2-channel.md` | `ipc::Channel<T>` pattern + 100 ms coalescer wiring | Rust + FE subagents |
| `next-16-static-client.md` | `'use client'` + verification stamp comment (Plan 02 §3.4) | FE subagents |
| `shadcn-recipe.md` | When and how to `pnpm dlx shadcn@4 add <component>` (and how to scope the diff) | FE subagents |
| `yt-dlp-crate-recipe.md` | `Libraries::new`, `Downloader::builder`, `hooks().on_progress` snippets | Rust subagents |
| `lofty-tag-write.md` | Round-trip-safe tag writer (Plan 06 §5) | Rust subagents |
| `animation-r1-r4.md` | "Refuse to write `transition-height`/`transition-all`" lint reminder | FE subagents |
| `license-header.md` | SPDX-style header (Plan 08 §3) | All subagents writing new files |

Skills are auto-attached when an agent's plan mentions matching keywords (e.g., a plan that mentions "command" attaches `tauri-2-command.md`).

### 2.4 `agy` CLI parity (for terminal-only operators)

Operators who prefer the shell can run the same harness via:

```bash
agy init --workspace . \
  --model gemini-3.1-pro \
  --thinking-level high \
  --knowledge-base .gemini/antigravity/knowledge \
  --skills .gemini/antigravity/skills
```

Both surfaces share the same artifacts. Use this for Phase 4 CI runs.

---

## 3. Subagent roster

These map 1:1 to `plans/03_CLAUDE_PLAN.md` §7 and `SKILL.md`'s multi-agent template. In Antigravity terms they are **dynamic subagents** the primary agent will spawn under the Manager Surface.

| Subagent | Model | Scope (write) | Skills auto-attached | PR label |
|---|---|---|---|---|
| `agent_arch` | Gemini 3.1 Pro **High** | `plans/`, `docs/adr/`, `documentation/CHANGELOG.md` | (none auto) | `arch` |
| `agent_contracts` | Gemini 3.1 Pro **High** | `src-tauri/src/contracts/`, generates `src/lib/api-contracts.gen.ts` | `tauri-2-command`, `license-header` | `feature:fullstack` |
| `agent_backend_extractor` | Gemini 3.1 Pro **High** | `src-tauri/src/download/`, `src-tauri/src/media/`, `src-tauri/src/util/` | `tauri-2-command`, `tauri-2-channel`, `yt-dlp-crate-recipe`, `lofty-tag-write`, `license-header` | `backend` |
| `agent_backend_capabilities` | Gemini 3.1 Pro **High** | `src-tauri/capabilities/`, `src-tauri/tauri.conf.json` | `tauri-2-command`, `license-header` | `security` |
| `agent_frontend_shell` | Gemini 3.5 Flash | `src/src/app/layout.tsx`, `src/src/app/page.tsx`, top-level CSS | `next-16-static-client`, `animation-r1-r4`, `license-header` | `frontend` |
| `agent_frontend_setup` | Gemini 3.1 Pro **High** | `src/src/app/setup/`, `src/components/setup-progress.tsx` | `next-16-static-client`, `tauri-2-channel`, `animation-r1-r4`, `license-header` | `frontend` |
| `agent_frontend_queue` | Gemini 3.1 Pro **High** | `src/src/app/downloads/`, `src/components/download-*.tsx` | `next-16-static-client`, `tauri-2-channel`, `animation-r1-r4`, `shadcn-recipe`, `license-header` | `frontend` |
| `agent_frontend_jelly` | Gemini 3.1 Pro **High** | `src/components/jelly-input.tsx`, `src/lib/text-metrics.ts`, `src/lib/will-change.ts` | `next-16-static-client`, `animation-r1-r4`, `license-header` | `perf` |
| `agent_devops` | Gemini 3.5 Flash | `.github/`, `eslint.config.mjs`, `.editorconfig`, `.prettierrc`, `tsconfig.json`, build scripts | (none auto) | `arch` |
| `agent_license` | Gemini 3.1 Pro **High** | `LICENSE`, `README.md` (license section only), `docs/THIRD_PARTY_LICENSES.md`, `src-tauri/resources/LICENSES/` | `license-header` | `security` |
| `agent_tests` | Gemini 3.5 Flash | `tests/`, `src-tauri/tests/`, `*.test.ts`, `*.test.tsx` | `tauri-2-command`, `tauri-2-channel`, `license-header` | `bug` / `feature:fullstack` |
| `agent_browser_verifier` | Gemini 3.5 Flash + **Browser sub-agent** | (no writes) | (none) | `perf` |

**Spawning rule:** the Manager runs `agent_arch` as the **always-on supervisor**. Every other subagent is spawned per task and **must** produce a Plan artifact before any write.

---

## 4. Phase-by-phase execution

The phases mirror `plans/README.md` "Phasing", expressed as Antigravity **scheduled tasks** and **agent missions**.

### Phase 0 — Pre-flight (~1 day, 1 session)

| # | Mission to primary (Gemini 3.1 Pro High) | Subagents spawned | Artifacts required |
|---|---|---|---|
| 0.1 | "Read every file under `plans/`, `documentation/`, and `docs/adr/`. Summarize locked decisions D1–D11 back to me, then build the Knowledge Base files (§2.2) from `plans/README.md` and `plans/02_AGENTS_PLAN.md`." | none | Plan, Walkthrough |
| 0.2 | "Spawn `agent_devops`: create `.editorconfig`, `.prettierrc`, `rust-toolchain.toml` (≥ 1.80), `eslint.config.mjs` baseline (with the rules from Plan 02 §5 + Plan 07 §2), and `scripts/check-agents-rules.sh`, `scripts/check-animation-rules.sh`, `scripts/check-compat.sh`. Run them — all must exit 0 on the current empty repo." | `agent_devops` | Plan, Walkthrough, terminal-output Artifact |
| 0.3 | "Spawn `agent_devops`: write `.github/workflows/{ci.yml,security-audit.yml,license.yml,agents-doc-drift.yml}` + `.github/pull_request_template.md` + `.github/labeler.yml` + `CODEOWNERS`. Commit; verify lint passes." | `agent_devops` | Plan, terminal-output |
| 0.4 | "Verify the Next.js docs are present under `node_modules/next/dist/docs/`. If they are, snapshot the index. If not, document the gap in `docs/adr/ADR-006-next-doc-vendoring.md` and propose mirroring." | none | Plan |

### Phase 1 — Backend foundation (~3–5 days)

Primary supervises. Subagents fan out under Manager Surface in parallel where dependencies allow.

```
Manager Surface — Phase 1 tree:

agent_arch (supervisor, Gemini 3.1 Pro High)
├── agent_contracts                  ──┐  (depends on nothing; runs first)
│                                       │
├── agent_backend_extractor   ◀────────┤  (depends on contracts being scaffolded)
│   ├── agent_tests (Rust unit)         │
│   └── agent_browser_verifier (idle)   │
│                                       │
└── agent_backend_capabilities   ◀────┘  (depends on commands being declared)
    └── agent_tests (capability-arg fuzz)
```

| # | Mission | Subagent | Skill bundle | Acceptance Artifact |
|---|---|---|---|---|
| 1.1 | "Scaffold `src-tauri/src/contracts/{mod.rs, download.rs, media.rs, setup.rs, error.rs}` from Plan 05 §6. Wire `ts-rs` in `src-tauri/build.rs` to emit `src/lib/api-contracts.gen.ts`. Run `cargo build`; commit." | `agent_contracts` | `tauri-2-command`, `license-header` | Plan, code-diff, `cargo build` log |
| 1.2 | "Implement `src-tauri/src/util/{url.rs, path.rs}` from Plan 05 §10 with the **6 fuzz tests** (scheme reject, localhost reject, traversal `..`, symlink escape, control-char reject, empty string)." | `agent_backend_extractor` + `agent_tests` | `tauri-2-command`, `license-header` | Plan, test log (all green) |
| 1.3 | "Implement `binaries::resolve` (Plan 05 §2.1) — tiered `AppData → System → Fail`. Behind a `MockInstaller` trait for testing. Wire to `setup_extractor` command. The setup channel emits `SetupEvent::Idle → CheckingBinaries → DownloadingDependencies → InstallingYtDlp → InstallingFfmpeg → Ready`." | `agent_backend_extractor` | `tauri-2-channel`, `yt-dlp-crate-recipe`, `license-header` | Plan, Walkthrough, `cargo test` log |
| 1.4 | "Implement `ExtractorBackend` trait + `YtDlpCrateExtractor` (Plan 05 §7). Wire hooks via `Downloader::hooks().on_progress` to a `ProgressSink` with the 100 ms coalescer (Plan 05 §9). Cancel via `tokio::select!`." | `agent_backend_extractor` | `tauri-2-channel`, `yt-dlp-crate-recipe`, `license-header` | Plan, Walkthrough, `cargo test` log |
| 1.5 | "Implement `DownloadManager` + `DownloadService::start` + the four commands `start_download`, `cancel_download`, `get_metadata`, `list_active` (Plan 05 §8). Add `MockExtractor` integration test asserting event ordering." | `agent_backend_extractor` + `agent_tests` | `tauri-2-command`, `tauri-2-channel`, `license-header` | Plan, integration-test log |
| 1.6 | "Implement `RunEvent::ExitRequested` drain (Plan 05 §13). Smoke-test by `kill -INT` mid-mock-download." | `agent_backend_extractor` | `tauri-2-command`, `license-header` | terminal-output Artifact |
| 1.7 | "Implement `src-tauri/capabilities/default.json` from Plan 05 §12 (zero `shell:allow-execute`). Implement `tauri.conf.json` CSP from Plan 05 §12. Run `cargo build` and confirm capability JSON schema validates." | `agent_backend_capabilities` | `license-header` | Plan, Walkthrough, schema-validate log |
| 1.8 | "Implement `media/tagging.rs` (Plan 06 §5) with round-trip tests on MP3, M4A, FLAC fixtures." | `agent_backend_extractor` + `agent_tests` | `lofty-tag-write`, `license-header` | Plan, test log |
| 1.9 | "Implement `update_yt_dlp` command (Plan 05 §2.2) + `get_diagnostics` (Plan 05 §6.2 + Plan 06 §10). Verify FFmpeg variant is reported." | `agent_backend_extractor` | `yt-dlp-crate-recipe`, `license-header` | Plan, test log |

**Phase 1 exit gate** (PR-level): `cargo clippy --all-targets -- -D warnings`, `cargo test`, `pnpm tsc --noEmit`, Plan 05 §18 acceptance items 1–6 ticked. Primary writes a Walkthrough summarizing the surface area added.

### Phase 2 — Frontend queue UI (~3–4 days)

```
agent_arch
├── agent_frontend_shell        (layout, theme, branding)
├── agent_frontend_setup        (first-run wizard — depends on 1.3)
├── agent_frontend_queue        (form + queue — depends on 1.5)
└── agent_browser_verifier      (records the flows above)
```

| # | Mission | Subagent | Artifact |
|---|---|---|---|
| 2.1 | "Create `src/src/app/layout.tsx` shell with `globals.css` already provided. Add `Header`, `Sidebar`. **No** progress state in this shell (Plan 05 §11). Add favicon from `TheAtlasB2048.png`." | `agent_frontend_shell` | Plan, screenshot |
| 2.2 | "Create `src/lib/api-client.ts` exporting `setupExtractor`, `startDownload`, `cancelDownload`, `getMetadata`, `getDiagnostics`, `updateYtDlp`, `openOutputDir`. Type from `src/lib/api-contracts.gen.ts` **only** — no relative imports into `src-tauri/`." | `agent_frontend_shell` | Plan, diff |
| 2.3 | "Implement `src/src/app/setup/page.tsx` + `src/components/setup-progress.tsx`. Listens to `setup_extractor`'s channel and renders an animated progress UI compliant with Plan 07 R1–R4. Redirect to `/downloads` on `Ready`." | `agent_frontend_setup` | Plan, screenshot, **browser recording** |
| 2.4 | "Implement `src/components/download-form.tsx` (URL + preset select). Submit calls `startDownload`. Use Base UI / Radix primitives already in deps." | `agent_frontend_queue` | Plan, screenshot |
| 2.5 | "Implement `src/components/download-queue.tsx` reducer + `src/components/download-queue-item.tsx` (`React.memo`, primitive props only) + `src/components/progress-bar.tsx` (GPU-only transform per Plan 07 §6) + `src/components/download-actions.tsx`." | `agent_frontend_queue` | Plan, screenshot, **browser recording** of a 3-item queue |
| 2.6 | "Implement `src/src/app/downloads/page.tsx` composing 2.4 + 2.5. Wire 100 ms `src/lib/coalesce.ts` helper around the channel listener." | `agent_frontend_queue` | Plan, screenshot |
| 2.7 | "Add Vitest test for the queue reducer with a canned `DownloadEvent` sequence." | `agent_tests` | test log |
| 2.8 | "`agent_browser_verifier`: drive the app end-to-end via the Chromium sub-agent — submit a URL, observe `Resolving → Downloading → Complete`, then submit a second URL and cancel it. Attach the recording." | `agent_browser_verifier` | **browser recording**, screenshots |

**Phase 2 exit gate:** screenshots + browser recording attached, `pnpm tsc --noEmit && pnpm lint && pnpm test` green, bundle-size check ≤ 200 KB gzipped (Plan 03 §7).

### Phase 3 — Polish & perf (~2–3 days)

This is **HIGH-thinking territory** — race conditions, micro-perf, animation jank.

| # | Mission | Subagent | Artifact |
|---|---|---|---|
| 3.1 | "Implement `src/lib/text-metrics.ts` + `src/components/jelly-input.tsx` from Plan 07 §4. Verify with React DevTools Profiler that typing the alphabet produces zero recalc-style entries in the RAF window. Attach a flame-chart screenshot." | `agent_frontend_jelly` | Plan, screenshot, **DevTools recording** |
| 3.2 | "Implement Sidebar group expand/collapse using the `.collapsible` Grid trick (Plan 07 §3 + §5). Search query auto-expands matching groups; `<Highlight/>` component renders matched substrings." | `agent_frontend_jelly` | Plan, screenshot |
| 3.3 | "Profile the queue at 5 concurrent mock downloads emitting 10 events/s each. Confirm only `DownloadQueueItem` commits; layout does not. If profile shows otherwise, find the culprit and fix before adding any `React.memo`." | `agent_frontend_queue` | DevTools Profiler JSON saved to `docs/perf/baseline-queue.json` |
| 3.4 | "Measure 720p YouTube download time on local machine via the `MockExtractor` wired to the real crate. Record in `docs/perf/baseline.md`. **If > 3 s**, escalate per ADR-005 §9." | `agent_backend_extractor` + `agent_browser_verifier` | terminal log + screenshot |
| 3.5 | "Run `ANALYZE=true pnpm build` and trim any > 50 KB gzipped contributor not strictly needed. Confirm total ≤ 200 KB gzipped." | `agent_devops` | bundle-analyzer HTML |
| 3.6 | "Run `cargo flamegraph --bin theatlas-media` while a download is active. Look for blocking I/O on the runtime thread. Attach SVG." | `agent_backend_extractor` | flamegraph SVG |

**Phase 3 exit gate:** all 7 NFRs from `plans/01_GOAL_PLAN.md` §4 measured, results in `docs/perf/baseline.md`.

### Phase 4 — Packaging & release (~2 days)

| # | Mission | Subagent | Artifact |
|---|---|---|---|
| 4.1 | "Spawn `agent_license`: copy `documentation/LICENSE.md` → `/LICENSE`. Rewrite `README.md` license section per Plan 08 §4. Generate `docs/THIRD_PARTY_LICENSES.md` via `cargo about` + `license-checker-rseidelsohn`. Populate `src-tauri/resources/LICENSES/`." | `agent_license` | Plan, diff, terminal log |
| 4.2 | "Implement `src/src/app/about/page.tsx` per Plan 08 §5. Screenshot it and archive to `docs/screenshots/about-v0.1.0.png`." | `agent_frontend_shell` + `agent_license` | Plan, screenshot |
| 4.3 | "Build release on all 3 OSes via GitHub Actions (`.github/workflows/release.yml`). Archive bundles. Confirm sizes ≤ Plan 01 §4 NFR for binary." | `agent_devops` | CI run URL + size table |
| 4.4 | "Manually verify FFmpeg variant in built bundle is LGPL (read from `Diagnostics`). Confirm WRITTEN OFFER and LGPL text are present in bundle resources." | `agent_license` | Plan, screenshot |
| 4.5 | "Run the release-blocking checklist (Plan 08 §11). Tick or escalate." | `agent_arch` (supervisor) | Plan |

---

## 5. Antigravity-specific guardrails

### 5.1 Mandatory **Plan artifact** before any write

Configure Manager Surface → Settings → Workflow → "Block writes without an approved Plan artifact" = **on**. The primary agent's plan must list:
- The exact files it will touch (paths only, no fuzz).
- The exact tests it will add/run.
- Which **locked decision** (D1–D11 in `plans/README.md`) authorizes the change. If none, escalate.

### 5.2 Mandatory **Walkthrough artifact** for risky areas

For any change touching `src-tauri/capabilities/`, `tauri.conf.json`, `src/lib/api-contracts.gen.ts`, `LICENSE`, or `package.json`, an inline-annotated Walkthrough is required. Inline annotations are the killer feature of Antigravity — use them like code-review comments on the agent's own diff.

### 5.3 Browser sub-agent verification

Antigravity's Chromium browser sub-agent runs flows for us. The mandatory recorded flows are:

| Flow | Trigger | What to assert |
|---|---|---|
| `setup-wizard.flow` | After Phase 1 ships `setup_extractor` | "Ready" state reached within 60 s on a 50 Mbps link |
| `submit-and-complete.flow` | After Phase 2 ships the queue | Resolving→Downloading→Complete badges within timeout |
| `cancel-mid-download.flow` | After Phase 2 ships cancel button | Cancellation badge within < 1 s; no `.part` file left in output dir |
| `about-attribution.flow` | After Phase 4 ships about page | Attribution string visible, commercial-license email visible, FFmpeg-LGPL notice visible |

Recordings are checked into `docs/recordings/` (git-LFS if added, else linked from CI artifacts).

### 5.4 Token / quota budgeting

Gemini 3.1 Pro: $2/M input, $12/M output. Rough envelope for the whole build:
- Architecture / planning turns: ~120 K input, ~30 K output × ~50 turns ≈ **6 M input + 1.5 M output = ~$30**.
- Subagent fan-out (Flash): ~5 M input + ~2 M output ≈ **$5–8** equivalent on Flash pricing.
- Browser-sub-agent verification turns: budget separately, ~$3.
- **Total expected: ~$40–50** of Gemini usage to drive Phases 0–4. Bundled inside AI Ultra ($100/mo) with 5× the Pro limits — well within bounds.

Set Manager Surface → Settings → Limits → "Daily Gemini 3.1 Pro budget" = **$15/day** to avoid runaway. Flash worker has no per-day cap (cheap enough).

### 5.5 `thought_signature` discipline

Every subagent definition must enable `pass_thought_signatures: true`. Without it, multi-turn tool calls fail with HTTP 400 on the second turn. Include this in `.gemini/antigravity/agents/<name>.yaml`:

```yaml
model: gemini-3.1-pro
thinking_level: high
tool_use:
  pass_thought_signatures: true
  tools:
    - shell
    - file_read
    - file_write
    - web_search       # only for agent_arch and agent_license
    - browser          # only for agent_browser_verifier
```

### 5.6 Conflict resolution rule (the **`00_ground_truth.md`** rule)

When sources disagree, this priority wins:

1. `LICENSE.md` / `documentation/LICENSE.md` (legal)
2. `documentation/GOAL.md` (scope)
3. `plans/README.md` "Cross-cutting decisions" table (D1–D11)
4. `docs/adr/ADR-XXX.md` referenced by the relevant locked decision
5. The specific plan in `plans/0N_*.md`
6. The source document in `documentation/`
7. Anything in agent training data

If (6) and (7) contradict (1)–(5), the agent **must** open a ticket via `agent_arch` to update the higher-priority source first, then proceed.

### 5.7 AGENTS.md compliance (the verification stamp)

Every `.tsx` file the agents write must carry the Plan 02 §3.4 stamp:

```tsx
// next@16.2.6 — verified against node_modules/next/dist/docs/<file>.md on YYYY-MM-DD
```

The `agent_frontend_*` subagents have this baked into their system prompt + `next-16-static-client` skill. The ESLint rule from Plan 02 §3 enforces it at PR time.

---

## 6. CI integration with `agy`

Use the Antigravity CLI for reproducible CI checks (no GUI):

`.github/workflows/agy-verify.yml`:
```yaml
name: agy-verify
on: [pull_request]
jobs:
  agy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google/antigravity-cli-setup@v1
        with:
          model: gemini-3.1-pro
          thinking-level: high
      - run: agy run agents/ci-pr-review.yaml
        env:
          ANTIGRAVITY_API_KEY: ${{ secrets.ANTIGRAVITY_API_KEY }}
```

`agents/ci-pr-review.yaml`:
```yaml
agent: pr_review
model: gemini-3.1-pro
thinking_level: high
mission: |
  Review the open PR against the rules in plans/README.md "Cross-cutting decisions"
  and plans/0N_*.md acceptance criteria for any plan whose scope the PR touches.
  Run cargo clippy, cargo test, pnpm tsc --noEmit, pnpm lint, pnpm test.
  Open inline review comments on the PR for any violation.
tools: [shell, file_read, github_pr_comment]
budget_usd: 0.50
```

Result: every PR gets an automated review by the same model that wrote the code, against the same rule set.

---

## 7. Daily operator checklist (humans)

Print this and stick it on the monitor.

- [ ] Open Antigravity workspace `theatlas-media`.
- [ ] Confirm Manager Surface → Models → primary = `gemini-3.1-pro` · `HIGH`.
- [ ] Review yesterday's Artifacts (Plans + Walkthroughs) — close anything stale.
- [ ] Pick the **next mission** from §4 phase tables.
- [ ] Have the primary agent write a Plan artifact first; inline-annotate any concerns; approve.
- [ ] Spawn the named subagent. Watch the Manager Surface; do not multi-task.
- [ ] On completion, open the Walkthrough; verify against the acceptance Artifact column.
- [ ] If the work passes: commit + PR + label per §3 table.
- [ ] If it doesn't: inline-annotate the Walkthrough, dispatch a fix-up turn.
- [ ] Log token cost (top-right) into `docs/perf/agent-spend.md` at end of day.

---

## 8. Acceptance criteria for this plan

This plan is satisfied when:

1. The Antigravity workspace is configured per §2 (settings + Knowledge Base + Skills) — verified by a screenshot of the Manager Surface saved to `docs/screenshots/antigravity-config.png`.
2. The 12 subagents in §3 exist as `.gemini/antigravity/agents/*.yaml`.
3. Every phase mission in §4 has a corresponding Plan + Walkthrough Artifact archived.
4. The four mandatory browser recordings in §5.3 exist.
5. The §6 `agy-verify` CI job runs on every PR and has rejected at least one rule-violating PR (proves the gate works).
6. The `.gemini/antigravity/knowledge/` files load on agent spawn (verified by asking a fresh subagent "what is D1?" and getting a correct answer in < 5 s).
7. Total Gemini spend for Phases 0–4 stays within the §5.4 envelope; recorded in `docs/perf/agent-spend.md`.

---

## 9. Risks and mitigations specific to Antigravity 2.0

| Risk | Source | Mitigation |
|---|---|---|
| Agents go off-script on long missions (1 M context attention falls off) | Gemini 3.1 Pro long-context limits | Cap missions at one phase-row of §4 at a time; force Plan artifact between rows. |
| Dynamic subagents spawn too aggressively → cost blowout | Antigravity 2.0 subagent feature | §5.4 daily budget cap + §2.1 file-write scoping forces the supervisor to be specific. |
| Browser sub-agent flakes on Chrome updates | Antigravity browser tool stability | Pin Chrome version in CI; fall back to Playwright via `agy run` if recording fails twice. |
| Knowledge Base drift (agent reads stale `00_ground_truth.md`) | Manual sync of KB to plans/ | Add a `scripts/sync-knowledge.sh` that regenerates KB from `plans/README.md` D-table; pre-commit-checked. |
| `thought_signature` accidentally stripped during retry → 400 errors | Gemini 3.x hard contract | §5.5 yaml setting; runtime check that responses contain non-empty signatures; auto-replay turn if missing. |
| Quota exhaustion mid-phase → Claude Sonnet 4.5 fallback writes Anthropic-flavored Rust | Multi-model platform | `.gemini/antigravity/agents/*.yaml` includes `fallback_model: claude-sonnet-4.5` only for `agent_devops` and `agent_tests` — *not* for `agent_arch`, `agent_contracts`, `agent_backend_capabilities`, or `agent_license`. The High-reasoning agents either run on Gemini 3.1 Pro or wait. |
| Browser recording leaks the user's real downloads folder path | Privacy | Run all Phase 2/3 verifications inside a fresh OS user profile pointed at `/tmp/theatlas-test/`. |

---

## 10. Execution checklist (lift into Antigravity scheduled task list)

- [ ] **AG-1** Configure Manager Surface per §2.1.
- [ ] **AG-2** Seed `.gemini/antigravity/knowledge/` per §2.2.
- [ ] **AG-3** Seed `.gemini/antigravity/skills/` per §2.3.
- [ ] **AG-4** Author `.gemini/antigravity/agents/*.yaml` for the 12 subagents in §3 with §5.5 settings.
- [ ] **AG-5** Author `agents/ci-pr-review.yaml` and `.github/workflows/agy-verify.yml` per §6.
- [ ] **AG-6** Walk Phase 0 (§4) end-to-end with the primary agent in a single session. Approve every Plan artifact inline.
- [ ] **AG-7** Walk Phase 1 mission-by-mission (§4). Dispatch named subagents only. No "vibe coding" allowed.
- [ ] **AG-8** Walk Phase 2 (§4). Attach screenshots and the two mandatory browser recordings before merging.
- [ ] **AG-9** Walk Phase 3 (§4). Record DevTools Profiler captures into `docs/perf/`.
- [ ] **AG-10** Walk Phase 4 (§4). Run release-blocking checklist (Plan 08 §11).
- [ ] **AG-11** Archive the workspace's final state of Artifacts to `docs/antigravity-artifacts/` for post-mortem.
- [ ] **AG-12** Author ADR-007 "Lessons learned: Antigravity 2.0 driving the v0.1 build" capturing what worked, what didn't, what to change for v0.2.
