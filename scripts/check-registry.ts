/**
 * Registry ↔ filesystem agreement check. Run from `scripts/check-structure.sh`.
 *
 * `validateRegistry()` normally runs on import, but only when NODE_ENV is not
 * "production" — which is exactly what `next build` sets, so the build never
 * sees a duplicate id or a dead-end leaf. Calling it here puts it back in CI.
 *
 * On top of that it keeps the sidebar honest in both directions: a "ready"
 * entry must lead somewhere, and a page that exists must be reachable.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_FLAT, routeOf, validateRegistry } from "@/registry/nav";
import { findRouteDir, listAppRoutes } from "./lib/app-routes";

/**
 * Routes that exist as pages but are deliberately absent from the nav tree:
 * the shell's own entry points, not product features.
 */
const UNLISTED_ROUTES = new Set(["/", "/404"]);

const problems: string[] = [];

// ── 1. The registry's own rules ──────────────────────────────────────────────

try {
	validateRegistry();
} catch (error) {
	problems.push(String(error instanceof Error ? error.message : error));
}

// ── 2. Every "ready" entry leads to a real page ──────────────────────────────

for (const entry of NAV_FLAT) {
	if (entry.item.status !== "ready") continue;
	const route = routeOf(entry.item.url);
	if (!route || route === "/") continue;

	const dir = findRouteDir(route);
	if (!dir || !existsSync(join(dir, "page.tsx"))) {
		problems.push(
			`"${entry.item.id}" is status "ready" but ${route} has no page.tsx — ` +
				`build it, or mark the entry "planned"`
		);
	}
}

// ── 3. Every real page is reachable from the registry ────────────────────────

const declared = new Set<string>();
for (const entry of NAV_FLAT) {
	const route = routeOf(entry.item.url);
	if (route) declared.add(route);
}

const appRoutes = listAppRoutes();

for (const { route } of appRoutes) {
	if (UNLISTED_ROUTES.has(route)) continue;
	if (declared.has(route)) continue;
	problems.push(`${route} has a page but no nav entry — nothing links to it`);
}

// ── 4. Every page has a layout beside it ─────────────────────────────────────

for (const { route, dir } of appRoutes) {
	if (!existsSync(join(dir, "layout.tsx"))) {
		problems.push(`${route} has page.tsx but no sibling layout.tsx`);
	}
}

// ── 5. Stamps on generated pages point at a real convention ──────────────────

const STAMP = "next@16.2.9 — verified against node_modules/next/dist/docs/";
for (const { route, dir } of appRoutes) {
	for (const file of ["page.tsx", "layout.tsx"]) {
		const path = join(dir, file);
		if (!existsSync(path)) continue;
		if (!readFileSync(path, "utf8").includes(STAMP)) {
			problems.push(`${route}/${file} is missing the Next verification stamp`);
		}
	}
}

// ── Report ───────────────────────────────────────────────────────────────────

if (problems.length > 0) {
	console.error("Registry check failed:");
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}

console.log(
	`Registry check passed — ${appRoutes.length} route(s), ${NAV_FLAT.length} nav entries.`
);
