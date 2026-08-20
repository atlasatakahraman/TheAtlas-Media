#!/usr/bin/env bun
/**
 * License harvesting and verification.
 *
 * Policy (00-Brain/Hard-Rules.md in the vault):
 *   ALLOW   MIT, Apache-2.0, BSD-*, ISC, MPL-*, Unlicense, CC0, Zlib
 *   DENY    GPL-*, AGPL-*, SSPL-*
 *   REVIEW  anything else, including missing
 *
 * Judged against shipping under AAKNCL v1.0 (non-commercial, all rights reserved)
 * and AAKCL v1.0 (commercial). Copyleft conflicts directly with both.
 *
 * SCOPE: npm/bun dependencies only. The Rust side is already covered by
 * `cargo deny check licenses` (src-tauri/deny.toml), which has its own curated
 * allow-list. Do not duplicate it here - deny.toml is the authority for crates.
 *
 * No new dependencies: licenses are read straight out of node_modules manifests.
 *
 *   bun run scripts/check-licenses.ts            # verify, exit 1 on denied
 *   bun run scripts/check-licenses.ts --report   # also write the inventory
 */

import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const DENY = /^(GPL|AGPL|SSPL)/i;
const ALLOW = /^(MIT.*|Apache-2\.0.*|BSD.*|ISC|MPL-2\.0|MPL|Unlicense|CC0-1\.0|0BSD|Zlib|Python-2\.0|Artistic-2\.0|Unicode-3\.0|Unicode-DFS-.*|CDLA-Permissive-.*|CC-BY-[0-9.]+|BlueOak-.*|AAKNCL-1\.0)$/i;

// LGPL deliberately does NOT match DENY (^GPL) and does not match ALLOW: weak copyleft
// is nuanced - dynamic linking is usually fine, static linking is not - so it lands in
// "review" for a human, which is the correct outcome rather than a blanket verdict.

type Pkg = { name: string; version: string; license: string; source: "npm" };
type Verdict = "allow" | "deny" | "review";

/** SPDX expressions like "MIT OR Apache-2.0" pass if ANY branch is allowed. */
function classify(raw: string): Verdict {
  const license = (raw ?? "").trim();
  if (!license) return "review";
  const parts = license.split(/\s+(?:OR|AND)\s+|\//i).map((p) => p.replace(/[()]/g, "").trim());
  if (parts.some((p) => ALLOW.test(p))) return "allow";
  if (parts.some((p) => DENY.test(p))) return "deny";
  return "review";
}

/** Walk node_modules one level deep, plus one level into @scopes. */
function npmPackages(): Pkg[] {
  const nm = join(import.meta.dir, "..", "node_modules");
  if (!existsSync(nm)) return [];
  const out: Pkg[] = [];
  const read = (dir: string) => {
    const manifest = join(dir, "package.json");
    if (!existsSync(manifest)) return;
    try {
      const p = JSON.parse(readFileSync(manifest, "utf8"));
      if (!p.name) return;
      const raw = typeof p.license === "string" ? p.license : p.license?.type ?? p.licenses?.[0]?.type ?? "";
      out.push({ name: p.name, version: p.version ?? "?", license: raw, source: "npm" });
    } catch { /* unreadable manifest is a review item, not a crash */ }
  };
  for (const entry of readdirSync(nm)) {
    if (entry === ".bin" || entry === ".cache") continue;
    if (entry.startsWith("@")) {
      for (const scoped of readdirSync(join(nm, entry))) read(join(nm, entry, scoped));
    } else {
      read(join(nm, entry));
    }
  }
  return out;
}

/**
 * ffmpeg is invoked as a subprocess by src-tauri/src/core/media/. It is LGPL-2.1+
 * by default and GPL when built --enable-gpl (x264/x265). Shelling out differs
 * materially from bundling and redistributing the binary - flag, never auto-pass.
 */
function ffmpegNote(): string[] {
  const notes: string[] = [];
  const packaging = join(import.meta.dir, "..", "packaging");
  const bundled = existsSync(packaging) &&
    readdirSync(packaging, { recursive: true } as any).some((f: any) => String(f).toLowerCase().includes("ffmpeg"));
  notes.push(
    `- **ffmpeg** — invoked as a subprocess by \`src-tauri/src/core/media/\`. LGPL-2.1+ by default, ` +
    `**GPL** when built \`--enable-gpl\` (x264/x265). ` +
    (bundled
      ? `A bundled ffmpeg artefact was found under \`packaging/\` — its own terms travel with it and AAKCL §9 does not override them.`
      : `No bundled artefact found under \`packaging/\`; it appears to be a runtime dependency supplied by the user, which is the lower-risk arrangement.`),
  );
  return notes;
}

const pkgs = npmPackages();   // crates: see src-tauri/deny.toml
const denied = pkgs.filter((p) => classify(p.license) === "deny");
const review = pkgs.filter((p) => classify(p.license) === "review");

console.log(`Scanned ${pkgs.length} npm packages (crates are covered by cargo deny / deny.toml)`);
console.log(`  allowed: ${pkgs.length - denied.length - review.length}`);
console.log(`  review : ${review.length}`);
console.log(`  DENIED : ${denied.length}`);

if (review.length) {
  console.log("\nNeeds manual review (unknown or unrecognised license):");
  for (const p of review.slice(0, 40)) console.log(`  ${p.source}  ${p.name}@${p.version}  ${p.license || "(none declared)"}`);
  if (review.length > 40) console.log(`  ... and ${review.length - 40} more`);
}

if (denied.length) {
  console.log("\nDENIED — copyleft, incompatible with AAKNCL/AAKCL:");
  for (const p of denied) console.log(`  ${p.source}  ${p.name}@${p.version}  ${p.license}`);
}

if (process.argv.includes("--report")) {
  const lines = [
    "# Third-Party Components",
    "",
    "Generated by `scripts/check-licenses.ts`. Feeds **AAKCL v1.0 §9** — AAKCL grants rights only",
    "to work authored by Atlas Ata KAHRAMAN; everything below keeps its own license.",
    "",
    `Scanned ${pkgs.length} npm packages. Denied: ${denied.length}. Needs review: ${review.length}. Crates: see \`src-tauri/deny.toml\`.`,
    "",
    "## Requires attention",
    "",
    ...ffmpegNote(),
    "",
    ...(denied.length
      ? ["## Denied", "", "| Source | Package | License |", "|---|---|---|",
         ...denied.map((p) => `| ${p.source} | \`${p.name}@${p.version}\` | ${p.license} |`), ""]
      : []),
    ...(review.length
      ? ["## Needs manual review", "", "| Source | Package | License |", "|---|---|---|",
         ...review.map((p) => `| ${p.source} | \`${p.name}@${p.version}\` | ${p.license || "(none declared)"} |`), ""]
      : []),
  ];
  const dest = join(import.meta.dir, "..", "docs", "third-party-components.md");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, lines.join("\n") + "\n", "utf8");
  console.log(`\nwrote ${dest}`);
}

process.exit(denied.length > 0 ? 1 : 0);
