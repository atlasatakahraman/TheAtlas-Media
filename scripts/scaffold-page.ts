/**
 * Page scaffolder.
 *
 *   bun --bun scripts/scaffold-page.ts youtube/download/audio
 *   bun --bun scripts/scaffold-page.ts youtube/download/audio --variant=center
 *   bun --bun scripts/scaffold-page.ts --stubs
 *
 * Writes a route's unit — `layout.tsx` + `page.tsx`, plus `data.ts`,
 * `functions.ts` and `types.ts` for a real page — with the Next verification
 * stamp already filled in, into the right route group. If the nav registry
 * does not know the route yet, an entry is appended to the matching domain
 * file so the page is reachable the moment it exists.
 *
 * `--stubs` is the bulk form: every `status: "planned"` route in the registry
 * gets the two-file `PlannedFeature` stub. Those routes 404'd before, which
 * reads as a broken app rather than an unfinished one. Stubs stay at two files
 * on purpose — the full unit is scaffolded when a page becomes real.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { NAV_FLAT, routeOf } from "@/registry/nav";
import type { FlatNavItem } from "@/registry/nav/types";
import { APP_DIR, findRouteDir, REPO_ROOT, resolveTargetDir, routeSegments } from "./lib/app-routes";

const STAMP_DOC = "01-app/01-getting-started/02-project-structure.md";

/** Frozen so a regenerated file does not churn its stamp on every run. */
const STAMP_DATE = "2026-08-19";

function stamp(): string {
	return `// next@16.2.9 — verified against node_modules/next/dist/docs/${STAMP_DOC} on ${STAMP_DATE}`;
}

// ── Route helpers ────────────────────────────────────────────────────────────

function normaliseRoute(input: string): string {
	const bare = input.split("#")[0]!.split("?")[0]!;
	const segments = routeSegments(bare);
	if (segments.length === 0) throw new Error(`"${input}" is not a page route`);
	return `/${segments.join("/")}`;
}

function titleFor(route: string): string {
	const last = routeSegments(route).at(-1)!;
	return last
		.split(/[-_]/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

const GROUP_BY_SEGMENT: Record<string, { file: string; idPrefix: string }> = {
	youtube: { file: "youtube.ts", idPrefix: "yt" },
	convert: { file: "convert.ts", idPrefix: "cv" },
	process: { file: "media.ts", idPrefix: "md" },
	files: { file: "system.ts", idPrefix: "sys" },
	settings: { file: "system.ts", idPrefix: "sys" },
};

/** Dotted nav id from a route: "/youtube/download/audio" -> "yt.download.audio". */
function navIdFor(route: string): string {
	const segments = routeSegments(route);
	const head = GROUP_BY_SEGMENT[segments[0]!]?.idPrefix ?? segments[0]!;
	return [head, ...segments.slice(1)].join(".");
}

const navByRoute = new Map<string, FlatNavItem>();
for (const entry of NAV_FLAT) {
	const route = routeOf(entry.item.url);
	if (route && route !== "/" && !navByRoute.has(route)) navByRoute.set(route, entry);
}

// ── Templates ────────────────────────────────────────────────────────────────

function layoutFile(variant: string): string {
	const arg = variant === "page" ? "" : `{ variant: "${variant}" }`;
	return `${stamp()}

import { createPageLayout } from "@/layout/page/create-page-layout";

export default createPageLayout(${arg});
`;
}

function stubPageFile(navId: string | undefined): string {
	const prop = navId ? ` navId="${navId}"` : "";
	return `${stamp()}

import PlannedFeature from "@/components/custom/planned-feature";

export default function Page() {
	return <PlannedFeature${prop} />;
}
`;
}

function pageFile(title: string, icon: string | undefined): string {
	const iconProp = icon ? `\n\t\t\ticon="${icon}"` : "";
	return `${stamp()}
"use client";

import PageShell from "@/layout/page/page-shell";
import { PAGE_DESCRIPTION, PAGE_TITLE } from "./data";

export default function Page() {
	return (
		<PageShell
			title={PAGE_TITLE}
			description={PAGE_DESCRIPTION}${iconProp}
		>
			<p className="text-sm text-muted-foreground">
				${title} is scaffolded but not implemented yet.
			</p>
		</PageShell>
	);
}
`;
}

function dataFile(route: string, title: string): string {
	return `/** Static config for ${route}. Anything a human would tweak lives here. */

export const PAGE_TITLE = "${title}";

export const PAGE_DESCRIPTION = "TODO: one sentence on what this page does.";
`;
}

function functionsFile(route: string): string {
	return `/** Pure logic for ${route}. No JSX, no hooks — so it stays testable. */

export {};
`;
}

function typesFile(route: string): string {
	return `/** Types for ${route}. */

export {};
`;
}

// ── Writing ──────────────────────────────────────────────────────────────────

let written = 0;
let skipped = 0;

function write(path: string, contents: string, force: boolean): void {
	if (existsSync(path) && !force) {
		skipped++;
		return;
	}
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, contents, "utf8");
	written++;
	console.log(`  + ${relative(REPO_ROOT, path).replace(/\\/g, "/")}`);
}

type ScaffoldOptions = { stub: boolean; variant: string; force: boolean };

function scaffold(route: string, options: ScaffoldOptions): void {
	const dir = resolveTargetDir(route);
	const entry = navByRoute.get(route);
	const title = entry?.item.title ?? titleFor(route);

	console.log(`${route}  ->  src/app/${relative(APP_DIR, dir).replace(/\\/g, "/")}`);

	write(join(dir, "layout.tsx"), layoutFile(options.variant), options.force);

	if (options.stub) {
		write(join(dir, "page.tsx"), stubPageFile(entry?.item.id), options.force);
		return;
	}

	write(join(dir, "page.tsx"), pageFile(title, entry?.item.icon), options.force);
	write(join(dir, "data.ts"), dataFile(route, title), options.force);
	write(join(dir, "functions.ts"), functionsFile(route), options.force);
	write(join(dir, "types.ts"), typesFile(route), options.force);
}

// ── Nav registry ─────────────────────────────────────────────────────────────

/**
 * Adds a top-level entry to the domain file that owns this route's first
 * segment. Deliberately top-level rather than guessing a parent: a wrong
 * nesting is quiet and annoying to find, whereas an entry sitting one level
 * too shallow is obvious the first time you open the sidebar.
 */
function appendNavEntry(route: string): void {
	const segment = routeSegments(route)[0]!;
	const group = GROUP_BY_SEGMENT[segment];
	if (!group) {
		console.log(`\nNo nav group owns "/${segment}". Add the entry by hand.`);
		return;
	}

	const path = join(REPO_ROOT, "src", "registry", "nav", group.file);
	const source = readFileSync(path, "utf8");
	const eol = source.includes("\r\n") ? "\r\n" : "\n";
	const marker = `${eol}\t],${eol}};`;
	const at = source.lastIndexOf(marker);
	if (at === -1) {
		console.log(`\nCould not find the item list in ${group.file}. Add the entry by hand.`);
		return;
	}

	const entry = [
		"\t\t{",
		`\t\t\tid: "${navIdFor(route)}",`,
		`\t\t\ttitle: "${titleFor(route)}",`,
		`\t\t\turl: "${route}",`,
		'\t\t\tstatus: "ready",',
		"\t\t},",
	].join(eol);

	writeFileSync(path, source.slice(0, at) + eol + entry + source.slice(at), "utf8");
	console.log(`\n  + nav entry in src/registry/nav/${group.file} (give it an icon and a shortcut)`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const force = args.includes("--force");
const bulk = args.includes("--stubs");
const variantArg = args.find((arg) => arg.startsWith("--variant="));
const variant = variantArg ? variantArg.slice("--variant=".length) : "page";

if (!["page", "center", "flush"].includes(variant)) {
	console.error(`Unknown variant "${variant}". Use page, center or flush.`);
	process.exit(1);
}

if (bulk) {
	const planned = new Map<string, FlatNavItem>();
	for (const entry of NAV_FLAT) {
		if (entry.item.status !== "planned") continue;
		const route = routeOf(entry.item.url);
		if (!route || route === "/") continue;
		if (!planned.has(route)) planned.set(route, entry);
	}

	let created = 0;
	for (const route of [...planned.keys()].sort()) {
		// A route that already has a page is either built or already stubbed.
		const existing = findRouteDir(route);
		if (existing && existsSync(join(existing, "page.tsx")) && !force) continue;
		scaffold(route, { stub: true, variant: "page", force });
		created++;
	}

	console.log(
		`\n${created} planned route(s) stubbed — ${written} file(s) written, ${skipped} left alone.`
	);
	process.exit(0);
}

const target = args.find((arg) => !arg.startsWith("--"));
if (!target) {
	console.error(
		"Usage: bun --bun scripts/scaffold-page.ts <route> [--variant=page|center|flush] [--force]"
	);
	console.error("       bun --bun scripts/scaffold-page.ts --stubs");
	process.exit(1);
}

const route = normaliseRoute(target);
scaffold(route, { stub: false, variant, force });
if (!navByRoute.has(route)) appendNavEntry(route);

console.log(`\n${written} file(s) written, ${skipped} left alone.`);
