# Plan 08 — LICENSE.md → Attribution & Third-Party Compliance

> **Source:** `documentation/LICENSE.md` (AAKNCL v1.0)
> **Owner:** Atlas Ata Kahraman — sole licensor for the project's first-party code.

This plan operationalizes the **Atlas Ata Kahraman Non-Commercial License v1.0** in the repo and in shipped binaries, *and* tracks third-party licenses bundled with the app (FFmpeg, Rust crates, npm packages).

---

## 1. License at a glance

- **Type:** Non-commercial, copyleft-lite, attribution-required.
- **Allowed:** Personal / educational / non-commercial use; copy; modify; share Derivative Works — **only if** §3 conditions met.
- **Required attribution string** (§3.1):
  > *Based on work by Atlas Ata KAHRAMAN (atlasfirarda)*
  > *GitHub: https://github.com/atlasatakahraman*
- **Prohibited (§4):** Commercial use, misrepresentation of authorship, trademark use ("TheAtlas", "AtlasAta", "atlasfirarda"), reverse engineering for commercial use, sublicensing.
- **Termination:** Automatic on violation.
- **Governing law:** Türkiye (Aydın courts).
- **Commercial inquiries:** `atlasatakahraman.com@gmail.com`.

## 2. In-repo placement

| Where | What | Why |
|---|---|---|
| `/LICENSE` (root) | Copy of `documentation/LICENSE.md` content **renamed** to `LICENSE` (or `LICENSE.md`) | GitHub/GitLab license detector picks it up; required by §3.2 for derivatives |
| `README.md` | License badge + 1-paragraph summary + link to `/LICENSE` + commercial-licensing email | Discoverability; §3.3 declaration |
| Top of every substantive new source file the project authors (e.g., `src-tauri/src/lib.rs`, `src/src/app/layout.tsx`) | Short SPDX-style header (§4 below) | Authorship clarity |
| `src/src/app/about/page.tsx` | Renders attribution string, version, third-party notices | §3.1 "prominent location" in distributed app |
| Bundled app resources (`src-tauri/resources/LICENSES/`) | Copies of: AAKNCL, FFmpeg LGPL, every direct Rust crate license, every direct npm dep license | §3.2 + third-party requirements |
| `docs/THIRD_PARTY_LICENSES.md` | Generated index of all transitive deps and their licenses | Audit trail; CI-regenerated |

## 3. Source file header (SPDX-style)

```rust
// SPDX-License-Identifier: LicenseRef-AAKNCL-1.0
// Copyright (c) 2025 Atlas Ata Kahraman (atlasfirarda)
// Part of TheAtlas Media Processing. Non-commercial use only.
// Full terms: /LICENSE  |  Commercial licensing: atlasatakahraman.com@gmail.com
```

(TypeScript / JSX: same content with `//` comments. CSS: `/* … */`.)

Mandatory on every **new** source file we author. Existing files get the header in a single bulk PR (use `scripts/stamp-license.sh`).

> SPDX uses `LicenseRef-AAKNCL-1.0` because AAKNCL is not in the SPDX list. Register internally; harmless to external tools.

## 4. `README.md` license section (drop-in)

```md
## License

This project is licensed under the **Atlas Ata Kahraman Non-Commercial License v1.0 (AAKNCL)** — see [LICENSE](./LICENSE).

> Based on work by Atlas Ata KAHRAMAN (atlasfirarda) — https://github.com/atlasatakahraman

**Personal, educational, and non-commercial use is free.**
Commercial use (selling, SaaS, paid features, bundling into a commercial product) requires a separate commercial license.

### Commercial licensing
Email: **atlasatakahraman.com@gmail.com**

### Third-party notices
TheAtlas Media bundles FFmpeg (LGPL 2.1+) and Rust/npm dependencies — see [`docs/THIRD_PARTY_LICENSES.md`](./docs/THIRD_PARTY_LICENSES.md) and [`src-tauri/resources/LICENSES/`](./src-tauri/resources/LICENSES/).
```

## 5. About screen (in-app §3.1 attribution)

Implemented at `src/src/app/about/page.tsx`. Must display:

1. App name, version (from `package.json` + `tauri.conf.json`).
2. The verbatim attribution block:
   > Based on work by **Atlas Ata KAHRAMAN** (atlasfirarda)
   > GitHub: https://github.com/atlasatakahraman
3. A "Licenses" section with links/dialogs opening each LICENSE file shipped in `src-tauri/resources/LICENSES/`.
4. A "Non-commercial use" notice (§3.3).
5. FFmpeg variant badge (LGPL or GPL — sourced from `dependency_status()` in Plan 06).
6. A "Commercial licensing" mailto link.

Wireframe acceptance: a screenshot of the About page in `docs/screenshots/about.png` is required in the release-blocking checklist.

## 6. Third-party license collection (automated)

Add two CI jobs (one per ecosystem) that materialize licenses into the bundle:

### 6.1 Rust

```yaml
# .github/workflows/license-rust.yml (job step)
- run: cargo install cargo-about
- run: cargo about init || true
- run: cargo about generate -c about.toml about.hbs > docs/THIRD_PARTY_LICENSES.rust.html
- run: cargo about generate -c about.toml about-md.hbs > docs/THIRD_PARTY_LICENSES.rust.md
- run: |
    mkdir -p src-tauri/resources/LICENSES/rust
    cargo about generate -c about.toml --format=json about.hbs | jq -r '.licenses[] | .text' \
      | csplit -z -f src-tauri/resources/LICENSES/rust/lic- - '/^$/' '{*}'
```

`about.toml` allowlist must include the licenses we accept (MIT, Apache-2.0, BSD-3-Clause, ISC, Unicode-DFS-2016, OpenSSL, MPL-2.0, LGPL-2.1+ for FFmpeg). Anything else → CI fails until reviewed.

### 6.2 npm

```yaml
- run: pnpm dlx license-checker-rseidelsohn --json --production --out docs/THIRD_PARTY_LICENSES.npm.json
- run: pnpm dlx license-checker-rseidelsohn --production --csv --out docs/THIRD_PARTY_LICENSES.npm.csv
- run: |
    node scripts/copy-npm-licenses.mjs   # writes each LICENSE file into src-tauri/resources/LICENSES/npm/
```

The bundle thus contains every required notice for redistribution.

## 7. FFmpeg compliance (LGPL 2.1+)

FFmpeg is the largest single licensing risk. To stay clean with LGPL **and** AAKNCL's non-commercial posture:

1. **Use an LGPL static build.** Pinned URL in `build.rs` (Plan 06 §4 / §9) is the one labelled LGPL by the upstream (e.g., the `BtbN/FFmpeg-Builds` "lgpl" variants on GitHub). SHA-256 verified.
2. **Bundle the FFmpeg source corresponding to the binary** (LGPL §6) — or provide a written offer in `src-tauri/resources/LICENSES/FFmpeg-WRITTEN-OFFER.txt`:
   > *The complete corresponding LGPL FFmpeg source for the version bundled with this release is available for 3 years at: \<download URL pinned per release\>. Contact: atlasatakahraman.com@gmail.com.*
3. **Ship the LGPL license text** at `src-tauri/resources/LICENSES/FFmpeg-LGPL-2.1.txt`.
4. **About page** clearly states: *"This product uses FFmpeg (LGPL 2.1+). FFmpeg is © its contributors. Source: \<link\>."*
5. **Do not** combine into a single executable in a way that defeats user re-linking — using a sidecar binary already satisfies this. Do not statically link FFmpeg into the Tauri binary (we don't; `ffmpeg-sidecar` keeps it as a separate executable).

If we ever switch to `ffmpeg-next` (rejected for v0.1 in Plan 06), step 5 needs LGPL re-linking review.

> **GPL variant of FFmpeg is forbidden** for this project until/unless we add an explicit GPL-compatible compliance path. The build script must hard-error on a GPL-variant URL.

## 8. yt-dlp / extractor crates

We do **not** ship the `yt-dlp` Python program with the app (Plan 05). The Rust extractor crate we depend on (`rusty_ytdl` at the time of writing) is published under its own permissive license — record it in §6 like any other crate.

If the `extractor-cli` opt-in feature is ever enabled in a release build (it shouldn't be by default — Plan 05 §10), the yt-dlp binary's own license (Unlicense) must be carried in `src-tauri/resources/LICENSES/yt-dlp-UNLICENSE.txt` and disclosed in the About page.

## 9. Trademark guard (§4.3)

- The brand names "TheAtlas", "AtlasAta", "atlasfirarda" and the logo assets (`TheAtlasB2048.png`, `TheAtlasW2048.png`) are **not** licensed to derivative-work redistributors. Plan 06 §3 and the README's contributing guide must say:

  > *Forks and derivatives may not use the TheAtlas name or logo without written permission. Rename your fork and remove `TheAtlas*.png` from any redistribution.*

- Add `scripts/check-trademarks.sh` for fork PRs:
  ```bash
  rg -nl 'TheAtlas|AtlasAta|atlasfirarda' --glob '!documentation/**' --glob '!LICENSE' --glob '!README.md' --glob '!plans/**'
  ```
  Informational only on the main repo (we *do* use the names); useful for downstream.

## 10. Commercial-use blocker

The default app build does **not** include analytics, license servers, or commercial-only features. To stay on the right side of §4.1 in case of derivatives:

- A future `enterprise` feature flag (if introduced) must be gated on a runtime `THEATLAS_COMMERCIAL_LICENSE_KEY` check and refuse to enable without it.
- Plan 03's PR template already has a "License-affecting change → owner sign-off" gate (§6 item).

## 11. Release-blocking checklist (gate before tagging a release)

Before any `git tag v*` and `tauri build --release`:

- [ ] **L-1** `/LICENSE` exists and matches `documentation/LICENSE.md`.
- [ ] **L-2** `README.md` license section (§4) is current.
- [ ] **L-3** `src/src/app/about/page.tsx` renders the attribution block + commercial mailto + FFmpeg notice (§5).
- [ ] **L-4** `docs/THIRD_PARTY_LICENSES.md` regenerated within last 7 days.
- [ ] **L-5** `src-tauri/resources/LICENSES/` contains: AAKNCL, FFmpeg-LGPL-2.1, FFmpeg-WRITTEN-OFFER, plus per-dep license files.
- [ ] **L-6** Bundled FFmpeg confirmed LGPL variant (`dependency_status().license == Lgpl`).
- [ ] **L-7** No GPL-only crates in dep tree (`cargo about` allowlist enforced).
- [ ] **L-8** No banned licenses in npm deps (`license-checker --failOn 'GPL;AGPL'`).
- [ ] **L-9** Source files we authored carry the SPDX header (§3); `scripts/stamp-license.sh --check` exits 0.
- [ ] **L-10** Screenshot of About page archived in `docs/screenshots/about-vX.Y.Z.png`.

## 12. Execution checklist (initial setup)

- [ ] **L-A** Copy `documentation/LICENSE.md` to `/LICENSE` (or symlink in build).
- [ ] **L-B** Replace `README.md`'s create-next-app default content (Plan 02 already noted) — add the §4 license block.
- [ ] **L-C** Write `scripts/stamp-license.sh` (add header to files lacking one; `--check` mode for CI).
- [ ] **L-D** Write `scripts/copy-npm-licenses.mjs` to harvest per-dep `LICENSE*` files from `node_modules/`.
- [ ] **L-E** Add `about.toml` for `cargo-about` with the allowlist from §6.1.
- [ ] **L-F** Add `.github/workflows/license.yml` running both §6 jobs on every PR and on a weekly schedule.
- [ ] **L-G** Implement `src/src/app/about/page.tsx` per §5.
- [ ] **L-H** Add the FFmpeg WRITTEN OFFER file (§7.2).
- [ ] **L-I** Add `docs/THIRD_PARTY_LICENSES.md` (initial commit; CI re-generates).
- [ ] **L-J** Add license badge + section to root `README.md`.
- [ ] **L-K** Confirm `LICENSE` is detected by GitHub (will show in the sidebar under "License").

## 13. Acceptance criteria

1. The release-blocking checklist (§11) passes on `main`.
2. A forked repo can build, ship, and comply by reading `/LICENSE` + `README.md` alone — no insider knowledge required.
3. FFmpeg-LGPL compliance has been reviewed by Atlas (sign-off note in `docs/adr/ADR-004-license-compliance.md`).
4. The About page is the single source of in-app legal truth.

## 14. Open questions (escalate to owner)

- **Q-L1:** Should we adopt SPDX-registered `Proprietary` until AAKNCL is upstreamed to the SPDX list, or stay with `LicenseRef-AAKNCL-1.0`?
- **Q-L2:** Should the LGPL FFmpeg "WRITTEN OFFER" be 3 years (LGPL minimum) or longer for community goodwill?
- **Q-L3:** Should we publish the AAKNCL text in a separate `theatlas-license` repo so the license can be referenced by URL (improves SPDX-style tooling)?
- **Q-L4:** Do we want a *separate* "personal commercial use" tier for individual creators (vs. agencies), or is a single commercial price acceptable?
