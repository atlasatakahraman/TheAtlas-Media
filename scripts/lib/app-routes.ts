/**
 * Mapping between App Router directories and the URLs they serve.
 *
 * Shared by the scaffolder and the structure check so both agree on where a
 * route lives. The only subtlety is route groups: `src/app/(download)/youtube/`
 * serves `/youtube`, so `(parenthesised)` segments are invisible to the URL and
 * a new page under an existing group belongs *inside* that group, not beside it.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.url` rather than Bun's `import.meta.dir`: the same expression
// type-checks under tsc, which has no Bun globals.
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const APP_DIR = join(REPO_ROOT, "src", "app");

function isDir(path: string): boolean {
	return existsSync(path) && statSync(path).isDirectory();
}

function isRouteGroup(name: string): boolean {
	return name.startsWith("(") && name.endsWith(")");
}

/** Splits "/youtube/download/audio" into ["youtube","download","audio"]. */
export function routeSegments(route: string): string[] {
	return route.split("/").filter(Boolean);
}

/**
 * The directory serving `segment` beneath `dir`, looking through any route
 * groups on the way. Returns null when nothing serves it yet.
 */
function childDirFor(dir: string, segment: string): string | null {
	const direct = join(dir, segment);
	if (isDir(direct)) return direct;

	for (const name of readdirSync(dir)) {
		if (!isRouteGroup(name)) continue;
		const nested = childDirFor(join(dir, name), segment);
		if (nested) return nested;
	}
	return null;
}

/** Existing directory serving `route`, or null. */
export function findRouteDir(route: string): string | null {
	let dir = APP_DIR;
	for (const segment of routeSegments(route)) {
		const next = childDirFor(dir, segment);
		if (!next) return null;
		dir = next;
	}
	return dir;
}

/**
 * Where a page for `route` should be written: the deepest existing directory
 * on its path, extended with whatever segments do not exist yet. Keeps new
 * pages inside the route group their siblings already live in.
 */
export function resolveTargetDir(route: string): string {
	const segments = routeSegments(route);
	let dir = APP_DIR;
	let index = 0;

	for (; index < segments.length; index++) {
		const next = childDirFor(dir, segments[index]);
		if (!next) break;
		dir = next;
	}
	for (; index < segments.length; index++) {
		dir = join(dir, segments[index]);
	}
	return dir;
}

export type AppRoute = { route: string; dir: string };

/** Every route with a `page.tsx`, discovered by walking the app directory. */
export function listAppRoutes(): AppRoute[] {
	const found: AppRoute[] = [];

	const walk = (dir: string, route: string) => {
		if (existsSync(join(dir, "page.tsx"))) {
			found.push({ route: route === "" ? "/" : route, dir });
		}
		for (const name of readdirSync(dir)) {
			const child = join(dir, name);
			if (!isDir(child)) continue;
			// Private folders (_name) are never routable.
			if (name.startsWith("_")) continue;
			walk(child, isRouteGroup(name) ? route : `${route}/${name}`);
		}
	};

	walk(APP_DIR, "");
	return found.sort((a, b) => a.route.localeCompare(b.route));
}
