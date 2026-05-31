# SKILL.md — OpenClaude Full-Stack Agent Skills
## Next.js 16.x + Tauri 2.x Development
## Atlas Ata Kahraman | Multi-Provider Setup

**Skill ID**: `atlas-fullstack-openclaude-v3`  
**Compatible With**: OpenClaude (all providers)  
**Architecture**: Agent-First, Provider-Routed

---

## Skill Metadata

```yaml
name: "Full-Stack Documentation & Development Agent"
version: "3.0.0"
target_frameworks:
  - tauri: "2.x"
  - nextjs: "16.x"
  - react: "19.x"
  - typescript: "5.x"
  - rust: "1.80+"

capabilities:
  - documentation_fetching
  - version_compatibility_analysis
  - bug_detection_and_hotfix_awareness
  - performance_optimization_guidance
  - multi_agent_coordination
  - security_vulnerability_scanning
  - ipc_architecture_planning

recommended_provider_by_skill:
  documentation_fetching: "gemini-3.5-flash (native web search)"
  architecture_planning: "deepseek-v4-pro (reasoning mode)"
  standard_coding: "deepseek-v4-pro"
  quick_edits: "deepseek-v4-flash"
  security_audit: "deepseek-v4-pro (thorough)"
  free_fallback: "deepseek/deepseek-r1:free via OpenRouter"
```

---

## Skill 1 — Documentation Fetching

**Trigger Patterns:**
- `How do I [use feature] in [framework v16]?`
- `What's the latest way to [implement pattern]?`
- `Is [API] still available in current version?`
- `Breaking changes between [version] and [version]?`
- `@latest [anything]`

**Recommended Provider**: Gemini 3.5 Flash (native web search) or DeepSeek + DuckDuckGo

**Execution Flow:**
1. Identify framework/crate and desired version
2. Web search in priority order:
   ```
   [framework] [feature] site:github.com/[org]/[repo] v[version]
   [framework] [feature] site:[official-docs]
   [crate] CHANGELOG latest release
   ```
3. Parse for: version requirements, deprecation warnings, CHANGELOG cross-reference
4. Return timestamped response with source attribution

**Output Format:**
```markdown
## [Feature] — Latest Documentation

**Version Required**: X.Y.Z+
**Status**: Active | ⚠️ Deprecated | 🔄 Changed in vX.Y
**Source**: [URL]
**Fetched**: [timestamp] / training data (run @latest to verify)

**Usage**:
[Code block — copy-paste ready]

**Breaking Changes**: [If any]
```

---

## Skill 2 — Version Compatibility Analysis

**Trigger Patterns:**
- `Will my code work with [version]?`
- `Minimum version for [feature]?`
- `Compatibility matrix for Tauri 2.x + Next.js 16?`

**Execution Flow:**
1. Parse current dependency versions from context or `package.json` / `Cargo.toml`
2. Fetch MSRV (Tauri), Next.js breaking changes, TypeScript requirements
3. Build compatibility matrix:
   ```
   Tauri 2.2+  → Rust 1.75+
   Next.js 16+ → Node 20+ | 22+ LTS
   React 19+   → TypeScript 5.0+
   ```
4. Flag incompatibilities with migration path

**Decision Gates (require human approval):**
- ✓ Minor version upgrade — auto-proceed
- ⚠️ Major version upgrade — request review
- 🔒 Breaking change requiring code rewrite — escalate

---

## Skill 3 — Bug Detection & Hotfix Awareness

**Trigger Patterns:**
- `I'm getting error [message] in [framework]`
- `Is there a known issue with [feature]?`
- `How do I work around [limitation]?`

**Recommended Provider**: DeepSeek V4 Pro (thorough analysis)

**Execution Flow:**
1. Receive error signature or feature name
2. Search GitHub Issues:
   ```
   GET /repos/[org]/[repo]/issues?q=is:open [error] label:bug&state=all&sort=updated
   ```
3. Cross-reference: release notes for hotfixes, closed issues, open PRs
4. Provide: root cause, workaround, ETA, version where fix ships

**Bug Status Indicators:**
```
🔴 Unfixed — Issue #XXXX — [Workaround code]
🟡 In PR #XXXX — Expected merge: [date]
🟢 Fixed in vX.Y.Z — [Migration guide]
```

---

## Skill 4 — Performance Optimization

**Trigger Patterns:**
- `How do I optimize [component/feature]?`
- `My [Tauri app / Next.js page] is slow`
- `Best practices for [pattern]?`

### Rust/Tauri Side
Review for:
- Blocking I/O in async context
- Memory allocations (`&str` vs `String`, unnecessary `.clone()`)
- Database query N+1 problems
- Unnecessary serialization in IPC

Suggest:
- Async/await patterns, connection pooling, caching
- Batch Tauri command calls to reduce IPC overhead
- `cargo flamegraph --bin [binary]` for profiling
- `cargo bench --features bench`

### Next.js/React Side
Analyze for:
- Unnecessary re-renders (missing `useMemo`/`useCallback` — but profile first)
- Large bundle imports (prefer named imports, dynamic imports)
- Missing Server Components (default to server, opt-in to client)
- Missing `next/image` optimization

Tools:
```bash
ANALYZE=true next build  # next/bundle-analyzer
react-scan  # development profiling
lighthouse  # CI pipeline
```

### IPC Optimization
- Batch related Tauri commands into single round-trips
- Use strongly typed `invoke<T>()` — avoids runtime type errors
- Implement request coalescing for high-frequency events
- Profile: Chrome DevTools → Performance tab → look for IPC spikes

---

## Skill 5 — Multi-Agent Coordination

**Trigger Patterns:**
- `Build me a full-stack feature: [description]`
- `Coordinate agents for [complex task]`

**Agent Spawn Template:**
```yaml
agents:
  - id: "agent_frontend"
    focus: "Next.js UI + components"
    scope: [app/[route]/, components/, lib/api-client.ts]
    approval_gates: [breaking_api_changes]

  - id: "agent_backend"
    focus: "Tauri commands + database"
    scope: [src-tauri/src/commands/, src-tauri/migrations/, api_contracts.ts]
    approval_gates: [schema_changes, security_code]

  - id: "agent_devops"
    focus: "CI/CD + build config"
    scope: [.github/workflows/, tauri.conf.json, next.config.ts]
    approval_gates: [all_terminal_commands]
```

**Coordination Rules:**
1. Share contract via `lib/api-contracts.ts` — single source of truth
2. Frontend agent reads types from api-contracts, never infers from backend code
3. Backend agent notifies frontend of breaking type changes before committing
4. No localStorage — all state in React memory

---

## Skill 6 — Security Vulnerability Scanning

**Trigger Patterns:**
- `Is my dependency secure?`
- `Run a security audit`
- `Check for CVEs`

**Recommended Provider**: DeepSeek V4 Pro (thorough)

**Execution Flow:**
```bash
cargo audit --json           # Rust dependencies
npm audit --json             # JS/TS dependencies
npm outdated --long          # Show stale packages
```

CVE search:
```
site:github.com/advisories [crate-name]
CVSS score >= 5.0 → highlight
```

**Security Decision Gates:**
- ✓ Patch available → suggest immediate update
- ⚠️ No patch, mitigation available → review
- 🔒 Critical, no mitigation → block deployment + escalate

**Auto-Checked Patterns:**
```
sql_injection_patterns          xss_in_jsx
hardcoded_secrets               missing_csp_headers
unvalidated_tauri_ipc_args      client_side_only_validation
overly_permissive_cors          insecure_deserialization
```

---

## Skill 7 — IPC Architecture Planning

**Trigger Patterns:**
- `Design the IPC layer for [feature]`
- `How should frontend and backend communicate?`
- `Should I use a command or event here?`

**Recommended Provider**: DeepSeek V4 Pro (reasoning mode)

**Key Decisions:**
1. **Command vs Event**: Stateful/one-shot → Command | Real-time sync → Event
2. **Serialization**: Bincode (fast, internal) vs JSON (debuggable, public contract)
3. **Error Handling**: Typed `CommandError` enum, never `String` errors
4. **Batching**: Single vs bulk operations based on call frequency
5. **Caching**: Stale-while-revalidate on frontend for read-heavy queries

**Template:**
```rust
// src-tauri/src/commands.rs
#[tauri::command]
pub async fn fetch_user_profile(
    user_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<UserProfile, CommandError> {
    state.db.get_user(&user_id).await.map_err(CommandError::from)
}
```

```typescript
// lib/api-client.ts
export const fetchUserProfile = (userId: string): Promise<UserProfile> =>
  invoke<UserProfile>("fetch_user_profile", { userId });
```

---

## Skill Activation Matrix

| Trigger | Recommended Provider | Approval Required |
|---------|---------------------|-------------------|
| Version question | Gemini 3.5 Flash / DeepSeek + DDG | No |
| Bug report | DeepSeek V4 Pro | No |
| Performance problem | DeepSeek V4 Pro | No |
| Architecture design | DeepSeek V4 Pro (reasoning) | Yes — human review |
| Security audit | DeepSeek V4 Pro | Yes — human review |
| Database migration | DeepSeek V4 Pro | Yes — human approval |
| Full feature (frontend + backend) | DeepSeek V4 Pro (multi-agent) | Yes — approve contracts |

---

## Failure Modes & Recovery

| Failure | Recovery |
|---------|---------|
| Web search timeout | Return training-data answer; flag as stale; suggest `@latest` |
| CVE DB unavailable | GitHub Security Advisories as fallback |
| Incompatible versions | Suggest intermediate version + migration steps |
| Bug unfixed in current release | Workaround + link to PR/issue |
| Free tier rate-limited | Switch provider alias (`ocfree` → `oc` for paid) |
| DuckDuckGo blocked | Switch to Gemini for docs tasks (`ocg`) |

---

## Test Queries for Validating This Skill

```
1. "How do I use Suspense in Next.js 16?"
2. "@latest Is tauri::api::fs deprecated in Tauri 2.x?"
3. "Performance tips for React 19 server components"
4. "Design IPC for a real-time player queue feature"
5. "Check security vulnerabilities in my Tauri app"
6. "Breaking changes between Next.js 15 and 16?"
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.0.0 | May 2026 | OpenClaude port, provider routing, DeepSeek/Gemini support |
| 2.0.0 | May 2026 | Antigravity 2.0 alignment, multi-agent support (original) |
| 1.0.0 | Oct 2025 | Initial skill definition |

---

**Last Validated**: May 2026  
**Next Review**: August 2026  
**Provider**: DeepSeek V4 Pro / Gemini 3.5 Flash / OpenRouter
