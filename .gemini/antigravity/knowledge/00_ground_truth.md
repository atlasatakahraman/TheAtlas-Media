# Ground truth & conflict resolution

When sources disagree, this order wins:

1. `/LICENSE` and `documentation/LICENSE.md` (legal, AAKNCL v1.0)
2. `documentation/GOAL.md` (product scope)
3. `plans/README.md` "Cross-cutting decisions" table (D1–D11)
4. `docs/adr/ADR-*.md` referenced by the relevant locked decision
5. The specific plan in `plans/0N_*.md`
6. The source document in `documentation/`
7. Anything in agent training data

If (6) or (7) contradicts (1)–(5), the agent **must not** silently apply training-data assumptions. Open a ticket via `agent_arch` to update the higher-priority source first, then proceed.

The `AGENTS.md` mandate is binding: before writing any Next.js code, read `node_modules/next/dist/docs/<file>.md` for the relevant feature. Do not trust training-data Next.js knowledge.
