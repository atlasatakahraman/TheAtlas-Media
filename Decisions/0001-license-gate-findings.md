---
type: decision
project: theatlas-media
tags: [licensing, gpl, ffmpeg, ci, decision]
aliases: [ADR-0001 license gate, pngquant-bin]
created: 2026-08-20
updated: 2026-08-20
status: active
---

# ADR-0001 — First license-gate run: findings

`license.yml` was a stub (`TODO: License harvesting deferred to Plan 08`) that only echoed text.
It now runs `scripts/check-licenses.ts`, reading `node_modules` manifests directly — **no new
dependencies**.

## Scope: npm only

**The Rust side was already solved.** `src-tauri/deny.toml` carries a curated `[licenses] allow`
list, described in its own comment as *"exactly the licences present in the current tree — no
speculative headroom... A new dependency under an unlisted licence fails the build, which is the
prompt to check it against AAKNCL-1.0's non-commercial terms."*

A first pass of this gate duplicated that with a second Rust harvester and a hand-written
`.cargo/audit.toml` listing 17 advisory IDs. Both were removed. `deny.toml`'s approach is better:
`unmaintained = "workspace"` scopes failures by dependency depth, so it never goes stale the way a
hardcoded ID list does. **`deny.toml` is the authority for crates.**

The genuine gap was npm — `cargo deny` cannot see it.

## Policy

| Verdict | Licenses |
|---|---|
| Allow | MIT · Apache-2.0 · BSD · ISC · MPL · Unlicense · CC0 · Zlib · Unicode-3.0 · CDLA-Permissive · CC-BY · AAKNCL-1.0 |
| **Deny** (fails CI) | GPL · AGPL · SSPL |
| Review | everything else, including undeclared |

**LGPL is deliberately neither.** It matches neither `^GPL` nor the allow-list, so it lands in
review for a human. Weak copyleft is nuanced — dynamic linking is usually fine, static linking is
not — and a blanket verdict either way would be wrong.

## Why the `audit` job failed on every PR

Not a missing ignore list. `security-audit.yml` ran `cargo audit` **in addition to**
`cargo deny check advisories` in `ci.yml`'s supply-chain job. Both read the same RustSec database,
but `cargo audit` had no equivalent of `deny.toml`'s `unmaintained = "workspace"` scoping, so it
failed on transitive GTK3 and `unic-*` advisories that `cargo deny` deliberately tolerates.

`CLAUDE.md` already documented that this step should not exist:

> `cargo audit` is deliberately **not** also run. It reads the same RustSec database that
> `cargo deny check advisories` does, so it would only re-report the same findings.

The workflow simply hadn't caught up with the decision. **The step was removed**, which is the fix
— not a second ignore list.

## First run — 1,027 npm packages

**1 denied:**

| Package | License | Note |
|---|---|---|
| `pngquant-bin@6.0.1` | **GPL-3.0+** | Transitive, via an image-optimisation chain. Copyleft, incompatible with AAKNCL/AAKCL. |

**2 for review:**

| Package | License | Note |
|---|---|---|
| `jschardet@2.3.0` | LGPL-2.1+ | Weak copyleft; depends on link mode |
| `domutils@1.5.1` | undeclared | No `license` field at all |

**ffmpeg** — invoked as a subprocess by `src-tauri/src/core/media/`. LGPL-2.1+ by default, **GPL**
when built `--enable-gpl` (x264/x265). No bundled artefact was found under `packaging/`, which is
the lower-risk arrangement: shelling out to a user-supplied binary differs materially from
redistributing one. The report re-checks this on every run.

## Consequences

- The gate now **fails on GPL**, so a copyleft dependency cannot land unnoticed.
- `docs/third-party-components.md` is generated on every run and uploaded as a CI artifact. It is
  the inventory **AAKCL v1.0 §9** refers to — the section that stops AAKCL promising rights over
  code not authored here.
- `pngquant-bin` must be resolved before the gate can pass. Out of scope for this ADR; it is a
  dependency decision, not a licensing-policy one.
- `.cargo/audit.toml` was created and then deleted in the same session — recorded here so it is
  not reinvented. If crate advisories need tuning, tune `deny.toml`.
- `bun audit` in `security-audit.yml` is now `continue-on-error` — its findings are transitive
  dev-tooling chains, and failing on them made every PR red, which is how CI came to carry no
  signal at all. See [[ci-repair]].

## Related

[[licensing]] · [[ci-repair]] · [[github-pull-requests]] · [[theatlas-media]]
