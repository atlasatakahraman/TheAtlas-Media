/**
 * Shared version-string helpers for the Dependency Manager. Single source of
 * truth for turning raw `--version`/`-version` output into comparison keys
 * and display strings — previously duplicated (and buggy) in three places:
 * `app/settings/dependencies/page.tsx`, `layout/header/Header.tsx`, and
 * `components/dependency-dialogs.tsx`.
 *
 * IMPORTANT: the leading `v`/`n` strip only fires when immediately followed
 * by a digit. FFmpeg's git-master builds (including BtbN's managed builds)
 * report versions like `N-119343-g25b0a8e295` — stripping an unguarded
 * leading `N` there produces the mangled `-119343-g25b0a8e295`. Release tags
 * like `n7.1` / `v7.1` still normalize correctly because a digit follows.
 */

const VERSION_KEYWORD_RE = /(?:ffmpeg|ffprobe|yt-dlp)?\s*version\s+([^\s]+)/i;
const TOOL_PREFIX_RE = /^(?:ffmpeg|ffprobe|yt-dlp)\s+([^\s]+)/i;
const LEADING_V_OR_N_RE = /^[vn](?=\d)/i;

/** Extract the bare version token from a raw `--version` / `-version` line. */
export function extractVersionToken(raw: string | null | undefined): string {
	if (!raw) return "";
	const s = raw.trim();
	const match = s.match(VERSION_KEYWORD_RE) || s.match(TOOL_PREFIX_RE);
	return match?.[1] ?? s;
}

/**
 * Comparison form: lowercased, leading `v`/`n` stripped ONLY when followed
 * by a digit — so `v7.1`, `n7.1`, and `7.1` all normalize to `7.1`, while
 * `N-119343-g25b0a8e295` normalizes to itself (lowercased).
 */
export function normalizeVersion(raw: string | null | undefined): string {
	if (!raw) return "";
	const token = extractVersionToken(raw).toLowerCase();
	return token.replace(LEADING_V_OR_N_RE, "");
}

/**
 * Display form: the version token as-is, prefixed with `v` only when that
 * reads naturally — a bare digit-led version (`7.1` → `v7.1`), or an
 * `n`-prefixed release tag (`n7.1` → `v7.1`). Git-master strings such as
 * `N-119343-g25b0a8e295` are left completely untouched.
 */
export function formatVersionDisplay(raw: string | null | undefined): string {
	if (!raw || raw === "Not Installed") return "Not Installed";
	const trimmed = raw.trim();
	const lower = trimmed.toLowerCase();
	if (lower === "latest release" || lower === "latest" || lower === "vlatest") {
		return "Latest Release";
	}

	const token = extractVersionToken(trimmed);

	if (/^v/i.test(token)) return token;
	if (/^n(?=\d)/i.test(token)) return `v${token.slice(1)}`;
	if (/^\d/.test(token)) return `v${token}`;
	return token;
}
