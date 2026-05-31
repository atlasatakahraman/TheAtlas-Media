# Plan 04 — SKILL.md → Day-to-Day Playbook

> **Source:** `documentation/SKILL.md` (`atlas-fullstack-openclaude-v3`)
> **Purpose:** Turn each declared skill into a concrete repo workflow.

This plan converts the seven abstract skills from `SKILL.md` into runnable scripts, commands, and PR templates that live in the repo. Where `CLAUDE.md` defined *rules*, `SKILL.md` defines *how to apply them*.

---

## 1. Skill 1 — Documentation Fetching

**When to invoke:** any question that contains `@latest`, a version number, or a "current" framing.

**Repo support:**
- `scripts/docs-fetch.sh <framework> <feature>` — wraps a curl + jq pipeline that pulls the doc page from `tauri.app`, `nextjs.org`, `docs.rs`, or the GitHub release notes, caches to `.cache/docs/` (gitignored), and prints to stdout with a timestamp and source URL.
- All AI agents preface their answer with the output template from `SKILL.md` §"Output Format" (Version / Status / Source / Fetched / Usage / Breaking Changes).

**Cache eviction:** 24 h TTL per `CLAUDE.md` §"Web Search Strategy".

## 2. Skill 2 — Version Compatibility Analysis

**Authoritative matrix for this project** (lock in `docs/compat.md`):

| Component | Pinned | MSRV / minimum |
|---|---|---|
| Next.js | 16.2.6 | — |
| React | 19.2.4 | — |
| TypeScript | ^5 | 5.1 |
| Node | local | 20.9 LTS (Next 16 requirement) |
| Tauri | 2.11 | — |
| Rust | (set in `rust-toolchain.toml`) | 1.89* |
| tauri-plugin-shell | 2.x | matches tauri |
| tauri-plugin-opener | 2.5.4 | matches tauri |
| FFmpeg (bundled) | 7.x static | 6.0 minimum |

* 1.89 pin — actual minimum is 1.88 (darling/serde_with/time/plist require ≥1.88, others ≥1.87, ≥1.86, edition2024 needs ≥1.85). Pinned to 1.89 for one-minor headroom against the next dep bump. See documentation/CHANGELOG.md 2026-05-31.

`scripts/check-compat.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
node -v | grep -qE 'v(20\.[9-9]|2[1-9])' || { echo "Node ≥ 20.9 required"; exit 1; }
pnpm -v
cargo --version | awk '{print $2}' | awk -F. '{exit !($1==1 && $2>=89)}' || { echo "Rust ≥ 1.89 required (Tauri 2.11 transitive deps: darling, serde_with, time, plist require ≥1.88; we pin to 1.89 for one-minor headroom)"; exit 1; }
pnpm exec tsc --version
```

Wire into pre-commit + CI bootstrap step.

## 3. Skill 3 — Bug Detection & Hotfix Awareness

**Standardize bug-report PR comments** as the indicator block from `SKILL.md`:

```
🔴 Unfixed — Issue #XXXX — workaround in src/path/file.ts:NN
🟡 In PR #XXXX — expected merge: YYYY-MM-DD
🟢 Fixed in vX.Y.Z — upgrade plan: docs/adr/ADR-NNN.md
```

Add `docs/known-issues.md` that lists every active 🔴 / 🟡 with a code pointer. The release-readiness checklist (Plan 08) asserts this is empty or all entries justified.

## 4. Skill 4 — Performance Optimization

### 4.1 Rust/Tauri side
- `cargo install flamegraph` (dev tool; not pinned).
- `cargo flamegraph --bin theatlas-media` then attach the SVG to perf PRs.
- For IPC profiling: add a `tracing-subscriber` JSON layer behind `NEXT_PUBLIC_THEATLAS_DEBUG=1` parity flag `THEATLAS_TRACE=1`.

### 4.2 Next.js / React side
Add scripts to `package.json`:

```json
"analyze": "ANALYZE=true next build",
"react-scan": "react-scan http://localhost:3000",
"lh": "lighthouse http://localhost:3000 --quiet --chrome-flags='--headless'"
```

(react-scan and lighthouse are dev-only invocations via `pnpm dlx`; do not add to `dependencies`.)

### 4.3 IPC side
- Strongly typed `invoke<T>("cmd", args)` — never `invoke("cmd")` without the `<T>` parameter. Enforce with a custom ESLint rule that flags `invoke(` calls missing a type argument.
- High-frequency event coalescing helper (`src/lib/coalesce.ts`):
  ```ts
  export function coalesce<T>(fn: (last: T) => void, intervalMs = 100) {
      let pending: T | null = null;
      let scheduled = false;
      return (next: T) => {
          pending = next;
          if (scheduled) return;
          scheduled = true;
          requestAnimationFrame(() => {
              scheduled = false;
              if (pending !== null) { fn(pending); pending = null; }
          });
      };
  }
  ```
  Used by `DownloadQueueItem` when subscribing to progress (Plan 05 §FE).

## 5. Skill 5 — Multi-Agent Coordination

Already enforced in Plan 03 §7. `SKILL.md` adds:

- **Frontend agent reads types from `src/lib/api-contracts.ts` only.** Importing from `../src-tauri/**` is banned via ESLint `no-restricted-imports`.
- **Backend agent notifies frontend before committing breaking IPC changes.** PR template (Plan 03 §6) has the checkbox.

## 6. Skill 6 — Security Vulnerability Scanning

`.github/workflows/security-audit.yml` (one job from Plan 03 §5 plus the SKILL.md additions):

```yaml
- name: cargo audit
  run: cargo install cargo-audit && cargo audit --deny warnings
- name: pnpm audit
  run: pnpm audit --audit-level=high --json | tee pnpm-audit.json
- name: gitleaks
  uses: gitleaks/gitleaks-action@v2
- name: CVE search (informational)
  run: |
    for crate in $(cargo metadata --format-version=1 | jq -r '.packages[].name' | sort -u); do
      curl -s "https://api.github.com/search/issues?q=$crate+CVE+in:title+repo:advisories" \
        | jq -r --arg c "$crate" '.items[] | "\($c) → \(.title) (\(.html_url))"' || true
    done > cve-report.txt
    test ! -s cve-report.txt || cat cve-report.txt
```

Severity policy (from `SKILL.md`):
- ✓ Patch available → bot opens PR via Dependabot.
- ⚠️ No patch, mitigation available → label `security:review`, assign owner.
- 🔒 Critical, no mitigation → block deployment via CI gate.

## 7. Skill 7 — IPC Architecture Planning

The IPC decision rule (Command / Channel / Event) lives in Plan 03 §4. `SKILL.md` adds:

- **Serialization**: JSON for the public IPC contract (debuggable). Bincode only for internal Rust→Rust communication.
- **Error type**: `CommandError` enum (Plan 05 lists variants). **Never** `String`.
- **Batching threshold**: if a UI flow calls 3+ commands in sequence, refactor to a single batched command.
- **Caching**: stale-while-revalidate on the frontend for `get_extractor_status`, `get_ffmpeg_status`, `list_history`. Use a tiny in-memory store; no SWR/React-Query dep yet (none in `package.json`).

Reference template (mirror Rust and TS in same PR):

```rust
// src-tauri/src/contracts/mod.rs
#[derive(Debug, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/api-contracts.gen.ts")]
pub struct DownloadRequest { pub url: String, pub preset: FormatPreset, pub output_dir: String }
```

```ts
// src/lib/api-client.ts
import { invoke, Channel } from "@tauri-apps/api/core";
import type { DownloadRequest, DownloadEvent, DownloadId } from "@/lib/api-contracts.gen";

export function startDownload(req: DownloadRequest, onEvent: (e: DownloadEvent) => void): Promise<DownloadId> {
    const channel = new Channel<DownloadEvent>();
    channel.onmessage = onEvent;
    return invoke<DownloadId>("start_download", { request: req, onEvent: channel });
}
```

## 8. Skill Activation Matrix → repo PR labels

Mirror `SKILL.md` §"Skill Activation Matrix" as PR labels:

| PR label | Required reviewer |
|---|---|
| `arch` | Owner (Atlas) — architecture decisions |
| `security` | Owner — security gates |
| `migration` | Owner — DB / file-format changes |
| `perf` | Anyone — but PR must include before/after profile |
| `docs` | Anyone |
| `bug` | Anyone |
| `feature:fullstack` | Owner — spans FE+BE+contract change |

Add `.github/labeler.yml` so PRs touching certain paths auto-label:
```yaml
arch:        ['plans/**', 'docs/adr/**']
security:    ['src-tauri/capabilities/**', 'src-tauri/tauri.conf.json']
perf:        ['**/*.perf.*', 'plans/07_ANIMATION_PLAN.md']
docs:        ['documentation/**', 'README.md', 'CONTRIBUTING.md']
```

## 9. Failure-mode recovery → ops runbook

`docs/runbook.md` — one entry per `SKILL.md` §"Failure Modes & Recovery" row:

| Symptom | Page | Action |
|---|---|---|
| Web search timeout while researching | runbook §1 | Switch provider alias; cite training-data and flag |
| `cargo audit` DB down | runbook §2 | Use GitHub Advisories: `https://github.com/advisories?query=<crate>` |
| Incompatible versions reported | runbook §3 | Pin intermediate version + ADR |
| Open unfixed upstream bug | runbook §4 | Add to `docs/known-issues.md`, link PR/issue |
| Free-tier rate-limited | runbook §5 | Operator switches provider |
| DuckDuckGo blocked | runbook §6 | Operator switches to Gemini |

## 10. Validation queries → repo smoke tests

`SKILL.md` §"Test Queries for Validating This Skill" — encode as `docs/skill-smoke.md` so a new contributor can verify the toolchain end-to-end:

1. "How do I use Suspense in Next.js 16?" → expect a stamped answer per Plan 02 §3.4.
2. "@latest Is `tauri::api::fs` deprecated in Tauri 2.x?" → expect "Yes; use `tauri-plugin-fs` v2" + source.
3. "Performance tips for React 19 server components." → expect Plan 04 §4.2 reference.
4. "Design IPC for a player queue feature." → expect Plan 03 §4 decision rule applied.
5. "Check security vulnerabilities." → expect output of `pnpm audit` + `cargo audit`.
6. "Breaking changes between Next.js 15 and 16?" → expect changelog cite.

## 11. Execution checklist

- [ ] **S-1** Create `scripts/docs-fetch.sh` and `scripts/check-compat.sh`.
- [ ] **S-2** Create `docs/compat.md` from §2 table.
- [ ] **S-3** Create `docs/known-issues.md` (empty stub OK).
- [ ] **S-4** Create `docs/runbook.md` from §9.
- [ ] **S-5** Create `docs/skill-smoke.md` from §10.
- [ ] **S-6** Add `src/lib/coalesce.ts` from §4.3.
- [ ] **S-7** Add `analyze`, `react-scan`, `lh` scripts to `package.json` (do NOT add as deps).
- [ ] **S-8** Add `.github/labeler.yml` from §8 + `pull-request-labeler` workflow.
- [ ] **S-9** Add `ts-rs = "10"` to `src-tauri/Cargo.toml` dev-deps (defer wiring until Plan 05 lands contract structs).
- [ ] **S-10** Add `no-restricted-imports` ESLint rule blocking `../src-tauri/**`.

## 12. Acceptance criteria

1. Running `scripts/check-compat.sh` on a fresh clone exits 0.
2. The §10 smoke queries each produce an answer matching the expected shape (manual the first time, scripted later).
3. PR auto-labels work on a test PR touching `documentation/`, `src-tauri/capabilities/`, and `plans/`.
4. `src/lib/coalesce.ts` is used by at least one component by end of Phase 2 (Plan 05).
