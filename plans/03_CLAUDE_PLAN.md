# Plan 03 — CLAUDE.md → Operational Rules for All Agents

> **Source:** `documentation/CLAUDE.md` (v3.0, May 2026)
> **Audience:** Any human or AI agent contributing to this repo.

This plan extracts the binding operational rules from `CLAUDE.md` and turns them into enforceable repository configuration.

---

## 1. Provider routing (informational, not enforced in code)

The provider table from `CLAUDE.md` is **advisory** — the repo doesn't pin which model you use, but the task→model mapping should be honored when picking which assistant to dispatch:

| Task | Suggested model | Why |
|---|---|---|
| Architecture / IPC design | DeepSeek V4 Pro (reasoning on) | Cheapest deep-reasoner |
| Standard feature coding | DeepSeek V4 Pro | Default workhorse |
| Quick edits / file patches | DeepSeek V4 Flash | Latency + cost |
| Docs / web research | Gemini 3.5 Flash | Native web search |
| Free fallback | `deepseek/deepseek-r1:free` (OpenRouter) | Day-to-day exploration |
| SWE-bench-heavy debugging | Qwen 3.7 Max | 80.4 % SWE-bench |

> **Repo note:** keep `.env` examples for `OPENAI_BASE_URL` etc. out of the repo; document in `CONTRIBUTING.md` only. **Never commit API keys.** Pre-commit hook below enforces.

## 2. Web-search policy

| Setting | Value | Enforced where |
|---|---|---|
| Default: web search enabled | ✅ | Operator choice |
| Cache TTL for fetched docs | 24 h | Operator choice |
| Max parallel searches | 5 | Operator choice |
| Blocked domains | non-HTTPS, Medium | Operator choice |
| Allowed primary domains | `github.com/tauri-apps`, `github.com/vercel/next.js`, `tauri.app`, `nextjs.org`, `rust-lang.org`, `docs.rs`, `crates.io`, `npmjs.com` | Operator choice |

When unable to fetch, the agent **must** label its answer `(training data, not verified — run @latest to confirm)` per `CLAUDE.md` §"Fallback When Search Fails".

## 3. Code-generation standards (enforced in repo)

### 3.1 Rust

| Rule | Enforcement |
|---|---|
| `thiserror` for errors, `anyhow` only in `main.rs` / tests | `cargo clippy -- -D warnings` + custom deny lint |
| Full `?` propagation; **no `unwrap()` in production code** | `clippy::unwrap_used = "deny"` in `src-tauri/Cargo.toml` `[lints.clippy]` |
| `rustfmt` clean | `cargo fmt --check` in CI |
| Zero clippy warnings | `cargo clippy --all-targets -- -D warnings` in CI |
| Public APIs have doc comments with examples | `#![deny(missing_docs)]` on public crates |
| `Result<T, CommandError>` on every `#[tauri::command]` | grep CI step + code review |

Add to `src-tauri/Cargo.toml`:
```toml
[lints.clippy]
unwrap_used     = "deny"
expect_used     = "warn"
panic           = "warn"
todo            = "warn"
unimplemented   = "warn"
dbg_macro       = "warn"
print_stdout    = "warn"
print_stderr    = "warn"
unwrap_in_result = "deny"

[lints.rust]
unsafe_code = "forbid"
```

### 3.2 TypeScript

| Rule | Enforcement |
|---|---|
| `strict: true` | `tsconfig.json` (verify; add if missing) |
| `satisfies` over type assertions for literals | ESLint rule `@typescript-eslint/consistent-type-assertions` |
| Full type annotations on exports | ESLint rule `@typescript-eslint/explicit-module-boundary-types` |
| 2-space indent | Prettier config `tabWidth: 2` (but project uses tabs — see §3.4) |

Frontend code uses the @/* path alias (tsconfig.json paths) for intra-project imports. Relative imports are reserved for sibling files in the same directory. Direct imports from ../src-tauri/* are forbidden by the no-restricted-imports ESLint rule (plan 04 §5).

### 3.3 React

| Rule | Enforcement |
|---|---|
| Server Components by default | Lint rule: only files starting with `'use client'` may import client-only APIs |
| Explicit client boundary only when needed | Same |
| No `useState` in animation loops | Custom ESLint rule + Plan 07 §4 |

### 3.4 Formatting — current observed style

The supplied `globals.css` uses **hard tabs**. Lock this in `.editorconfig`:

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{ts,tsx,js,jsx,json,css}]
indent_style = tab
indent_size  = 4

[*.{rs,toml}]
indent_style = space
indent_size  = 4

[*.md]
trim_trailing_whitespace = false
```

Prettier:
```json
// .prettierrc
{ "useTabs": true, "tabWidth": 4, "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }
```

> Resolves the apparent conflict between `CLAUDE.md` ("2-space indent") and the existing code style (tabs). **Existing code wins** — update `CLAUDE.md` to match repo reality (mark as a doc fix; see checklist C-1).

### 3.5 Comments

- Public APIs → doc comments with at least one example.
- Complex logic → comments explain **WHY**, not WHAT.
- `TODO` only when intentionally left for the user; otherwise file an issue.

## 4. IPC patterns (binding for Plan 05 / 06)

From `CLAUDE.md` §"Code Generation Standards" → "IPC PATTERNS":

1. **`#[tauri::command]` for typed RPC.** Never raw `emit` from JS to Rust.
2. **Batch related commands** to minimize IPC overhead (e.g., `get_initial_state` returns settings + recent downloads + extractor status in one call).
3. **`Result<T, CommandError>` always.** Never `String` errors.
4. **Single source of truth for IPC types**: `src/lib/api-contracts.ts` mirrors the Rust types in `src-tauri/src/contracts/`. Use one of:
   - Hand-authored, kept in sync by PR review (v0.1).
   - `ts-rs` crate auto-generation (target by v0.2). Add `ts-rs = "10"` to dev deps and `#[derive(TS)]` on every contract struct.

Channel vs Event vs Command decision rule:

| Use case | Mechanism |
|---|---|
| One-shot RPC, returns once | `#[tauri::command]` |
| Streaming progress for a known call | `ipc::Channel<T>` passed as a command argument |
| App-global broadcasts (e.g., "extractor updated") | `Emitter::emit` + `listen` |
| Real-time sync (multiple subscribers, no caller) | `Emitter::emit` |

## 5. Security gates (enforced)

`CLAUDE.md` "Security Auto-Flags" → repo enforcement:

| Pattern | Tool |
|---|---|
| `sql_injection_patterns` | N/A (no SQL in v0.1) |
| `xss_in_jsx` | `eslint-plugin-react/no-danger`, `react/jsx-no-target-blank` |
| `hardcoded_secrets` | `gitleaks` pre-commit + CI; ensure `.env.local` is gitignored (verify) |
| `missing_csp_headers` | Lint `tauri.conf.json` for `app.security.csp` non-empty (Plan 05) |
| `unvalidated_tauri_ipc_args` | Code review + `validator` crate annotations on command structs |
| `client_side_only_validation` | Code review checklist item |
| `overly_permissive_cors` | N/A in Tauri webview |
| `insecure_deserialization` | Use `serde` derive only; never `serde_json::from_str::<Value>` then `as_str()` without bounds |

Audit commands (run in CI weekly):
```bash
cargo audit --json
pnpm audit --json
pnpm outdated --long
```

Add `.github/workflows/security-audit.yml` to run those on a schedule and on PRs touching `Cargo.toml`/`package.json`.

## 6. Decision gates requiring human review

From `CLAUDE.md` §"Decisions Requiring Human Review", explicitly enforce in PR template:

```md
<!-- .github/pull_request_template.md -->
## Risk gates (check any that apply)
- [ ] Schema / migration change → requires reviewer with `backend` role
- [ ] Breaking IPC type change → must update `src/lib/api-contracts.ts` + Rust mirror in same PR
- [ ] Security-sensitive change → requires reviewer with `security` role; link CVE / threat model
- [ ] `cargo publish` / `npm publish` / `tauri build --release` triggered → blocked from auto-merge
- [ ] CSP / capabilities change in `src-tauri/capabilities/*.json` → second reviewer required
- [ ] License-affecting change (Plan 08) → requires owner sign-off

## GOAL.md sanity checks
- [ ] React shell does not re-render on progress updates
- [ ] No raw yt-dlp flags or shell strings from UI
- [ ] All commands return `Result<T, CommandError>`
```

## 7. Multi-agent coordination

From `CLAUDE.md` §"Multi-Agent Coordination". Repo expression:

```
agent_frontend  → src/app/**, src/components/**, src/lib/api-client.ts, src/lib/api-contracts.ts (read-only)
agent_backend   → src-tauri/src/**, src-tauri/Cargo.toml, src/lib/api-contracts.ts (write)
agent_devops    → .github/**, src-tauri/tauri.conf.json, src-tauri/capabilities/**, next.config.ts, build.rs
```

Coordination rules:
1. **Single contract file**: `src/lib/api-contracts.ts`. Frontend imports types from here only, never from `src-tauri/`.
2. **Backend agent owns mutations** to that file and announces breaking changes in the PR description.
3. **No `localStorage`.** All state in React memory (`useState`, `useReducer`, or a small `zustand`/`jotai` store if we adopt one — currently neither is in deps).
4. **Bundle budget**: ≤ 200 KB gzipped for the Next.js client. Enforce with `@next/bundle-analyzer` + a CI step asserting `gzip < 204800` on `.next/static/**/*.js` total.

## 8. Context-window discipline (for AI agents)

When working through these plans:
- Don't re-quote earlier context; reference with "as in Plan 0X §Y".
- Put any code block > 50 lines in a file under `plans/_artifacts/` and link.
- Limit a single conversation turn to one plan unless explicitly broadening.

## 9. Execution checklist

- [ ] **C-1** Update `CLAUDE.md` to match repo style (tabs, not 2-space). Commit as a doc-fix.
- [ ] **C-2** Add `.editorconfig` and `.prettierrc` from §3.4.
- [ ] **C-3** Add the `[lints]` blocks from §3.1 to `src-tauri/Cargo.toml`.
- [ ] **C-4** Add `tsconfig.json` "strict": true (verify; patch if missing).
- [ ] **C-5** Add `.github/pull_request_template.md` from §6.
- [ ] **C-6** Add `gitleaks` pre-commit; verify `.env.local` is gitignored.
- [ ] **C-7** Add `.github/workflows/security-audit.yml` (weekly + on dep changes).
- [ ] **C-8** Add `@next/bundle-analyzer` to devDeps and a CI gate at 200 KB gzipped.
- [ ] **C-9** Create `src/lib/api-contracts.ts` stub with a comment pointing at `src-tauri/src/contracts/` and Plan 05.
- [ ] **C-10** Add a `CODEOWNERS` file mapping the three agent scopes to GitHub teams (or solo owner for now).

## 10. Acceptance criteria

1. CI green on `cargo fmt --check && cargo clippy --all-targets -- -D warnings && pnpm lint && pnpm tsc --noEmit`.
2. PR template appears on every new PR.
3. `cargo audit` and `pnpm audit` both have **zero** high/critical findings on `main`.
4. The §5 grep-style anti-patterns (Plan 02) return zero hits.
5. Bundle size CI gate passes on `main`.
