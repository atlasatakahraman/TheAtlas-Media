# CLAUDE.md — OpenClaude Model Context Configuration
## Full-Stack Tauri 2.x + Next.js 16.x Development
## Atlas Ata Kahraman | OpenClaude Multi-Provider Setup

**Configuration Version**: 3.0  
**Compatible Providers**: DeepSeek V4 Pro, Kimi K2.6, Qwen 3.7 Max, Gemini 3.5 Flash, GPT-5.5  
**Framework Target**: Tauri 2.x + Next.js 16.x  
**Date**: May 2026

---

## Provider Routing Strategy

Route by task type to balance quality and cost:

| Task Type | Model | Provider | Notes |
|-----------|-------|----------|-------|
| Architecture / IPC design | `deepseek-v4-pro` (reasoning on) | DeepSeek direct | ~$0.03/session |
| Standard feature coding | `deepseek-v4-pro` | DeepSeek direct | Default workhorse |
| Quick edits / file patches | `deepseek-v4-flash` | DeepSeek direct | Fast + near-free |
| Docs / web research heavy | `gemini-3.5-flash` | Google AI Studio | Native web search |
| Zero-cost fallback | `deepseek/deepseek-r1:free` | OpenRouter | Daily limit applies |
| Complex reasoning / debugging | `qwen/qwen-3.7-max` | OpenRouter | 80.4% SWE-bench |

### Provider Environment Variables

**DeepSeek (primary):**
```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY="sk-DEEPSEEK_KEY"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export OPENAI_MODEL="deepseek-v4-pro"
```

**OpenRouter (all models via one key):**
```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY="sk-or-OPENROUTER_KEY"
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_MODEL="deepseek/deepseek-v4-pro"  # or :free for zero cost
```

**Gemini (docs + web search tasks):**
```bash
export CLAUDE_CODE_USE_GEMINI=1
export GEMINI_API_KEY="GEMINI_KEY"
export GEMINI_MODEL="gemini-3.5-flash"
```

---

## Web Search Strategy

### Default Behavior
- **Enabled**: true
- **Gemini**: native provider web search
- **DeepSeek / OpenRouter**: DuckDuckGo fallback (may rate-limit; add Firecrawl for reliability)
- **Cache TTL**: 24 hours for fetched docs
- **Max parallel searches**: 5

### Manual Triggers
Prefix queries with:
- `@latest` — force-fetch latest documentation
- `@search` — explicit web search
- `@github` — GitHub-specific search
- `@stack` — StackOverflow search

### Auto-Search Patterns

**Pattern 1 — Version Queries**
```
Regex: /(?:how|what|is|show).+(?:in|with|for)\s+(?:\w+\s+)?(?:\d+\.\d+|latest|current)/i
Examples:
  "How do I use X in Tauri 2.2?"
  "Is this API available in React 19?"
Action: Search [feature] site:github.com/[org]/[repo] [version]
```

**Pattern 2 — Bug/Error Queries**
```
Regex: /(?:error|bug|issue|broken|deprecated).+(?:in|with)\s+[\w\s]+/i
Action: Search [error] site:github.com/[org]/[repo] issue
```

**Pattern 3 — Documentation**
```
Regex: /(?:documentation|docs|api reference|guide).+(?:for|in)\s+[\w\s]+/i
Action: Search [topic] site:[official-docs-domain]
```

**Pattern 4 — Security/Vulnerabilities**
```
Regex: /(?:security|vulnerable|audit|cve|cvss|exploit).+/i
Action: Search [crate/package] CVE site:github.com/advisories
```

### Allowed Search Domains (Priority Order)
```yaml
primary:
  - github.com/tauri-apps        # Tauri official
  - github.com/vercel/next.js    # Next.js official
  - github.com/facebook/react    # React official
  - tauri.app                    # Tauri docs
  - nextjs.org                   # Next.js docs
  - rust-lang.org                # Rust official
  - docs.rs                      # Rust crate docs
  - crates.io                    # Crate registry
  - npmjs.com                    # npm registry

community:
  - stackoverflow.com
  - reddit.com/r/rust
  - reddit.com/r/nextjs

blocked:
  - Any non-HTTPS domains
  - Medium (paywalled articles)
```

### Fallback When Search Fails
1. Use training knowledge — mark response as: `"(training data, not verified — run @latest to confirm)"`
2. Never hallucinate API names, crate versions, or function signatures
3. Always link to official source for verification

---

## Code Generation Standards

```
RULES AUTO-APPLIED:

1. VERSION GUARDS — always include:
   // Tauri 2.x (App Router, recommended)
   // For Tauri 1.x: [show v1 alternative if meaningfully different]

2. LANGUAGE:
   Rust  → thiserror/anyhow, full ? propagation, no unwrap() in production
   TypeScript → strict mode, satisfies operator, full type annotations
   React → Server Components by default, explicit client boundary only when needed

3. FORMATTING:
   Rust: rustfmt + clippy clean (zero warnings)
   TypeScript/JSX: Prettier + ESLint, 2-space indent
   
4. COMMENTS:
   Public APIs → doc comments with examples
   Complex logic → explain WHY not just WHAT
   TODOs → only if intentionally left for user to complete

5. TESTING:
   Library code → unit tests included
   Tauri commands → #[tauri::test] shown
   Next.js components → @testing-library/react template
   
6. IPC PATTERNS:
   Use #[tauri::command] for typed RPC, never raw message passing
   Batch related commands to minimize IPC overhead
   Result<T, CommandError> return type always

7. SECURITY AUTO-FLAGS:
   sql_injection_patterns
   xss_in_jsx
   hardcoded_secrets
   missing_csp_headers
   unvalidated_tauri_ipc_args
   client_side_validation_only (no server verification)
   overly_permissive_cors
```

---

## Response Formats

### Documentation Response
```markdown
## [Feature Name] — Latest Status

**Version Required**: X.Y.Z+
**Status**: 🟢 Active | 🟡 Stable | 🔴 Deprecated | 🔄 Changed in vX.Y
**Source**: [URL]
**Fetched**: [timestamp or "training data — verify with @latest"]

### Usage
[Copy-paste ready code example]

### Known Issues
- [Issue] — Status: Fixed in vX.Y | Workaround available | Open

### Breaking Changes vs Previous Version
[If applicable]
```

### Bug/Error Response
```markdown
## Issue Analysis

**Error**: [Quoted error message]
**Affected Versions**: [range]
**Status**:
  🔴 Unfixed — Issue #XXXX still open
  🟡 In PR #XXXX — expected merge [date]
  🟢 Fixed in vX.Y.Z

**Root Cause**: [Technical explanation]

## Immediate Workaround
[Code]

## Long-term Fix
[When available / migration path]

## Links
- [Issue URL]
- [Related StackOverflow / PR]
```

### Security Issue Response
```markdown
⚠️ SECURITY ISSUE DETECTED

**Issue**: [Description]
**Severity**: Critical | High | Medium
**CWE**: CWE-XXX

**Secure Implementation**:
[Fixed code]

**Test Case**:
[Test verifying the fix]
```

---

## Context Window Management

```
Available: ~128k tokens (varies by provider)

Budget allocation:
├─ CLAUDE.md (this file): ~2k
├─ SKILL.md: ~3k
├─ Conversation history: ~60k
├─ Current query: ~2k
├─ Web search results: ~20k
├─ Code artifacts: ~30k
└─ Response: ~11k
```

**Efficiency rules:**
- Don't repeat what user said — reference with "As discussed" or "Per your spec"
- Use artifacts (separate files) for code > 50 lines
- For follow-up questions: reference previous answer concisely, don't re-explain
- Group related searches into single queries where possible

---

## Multi-Agent Coordination

When a feature spans frontend + backend, spawn focused agents:

```yaml
agent_frontend:
  focus: Next.js UI, components, API client
  scope:
    - app/[route]/page.tsx
    - components/
    - lib/api-client.ts
  approval_gates:
    - breaking_api_changes

agent_backend:
  focus: Tauri commands, database layer
  scope:
    - src-tauri/src/commands/
    - src-tauri/migrations/
    - api_contracts.ts (shared)
  approval_gates:
    - database_schema_changes
    - security_sensitive_code

agent_devops:
  focus: CI/CD, Tauri build config
  scope:
    - .github/workflows/
    - tauri.conf.json
    - next.config.ts
  approval_gates:
    - all_terminal_commands
```

**Coordination rules:**
- Share contract via `lib/api-contracts.ts`
- No localStorage state — in-memory React state only
- Backend notifies frontend of breaking type changes
- Bundle size limit: 200kb gzipped for Next.js app

---

## Decisions Requiring Human Review

Flag and pause for approval on:
- Database schema changes
- Breaking API surface changes
- Security-related code
- `cargo publish` or `npm publish` commands
- Database migrations (`cargo sqlx migrate run`)

Auto-approve (no pause needed):
- Documentation fetches
- Code examples and explanations  
- Error analysis
- Non-destructive file reads

---

**Config Owner**: Atlas Ata Kahraman  
**Provider**: DeepSeek V4 Pro / OpenRouter  
**Stack**: Next.js 16.x + Tauri 2.x + React 19 + TypeScript 5.x + Rust 1.80+  
**Last Updated**: May 2026
