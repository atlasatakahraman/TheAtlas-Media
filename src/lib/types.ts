/**
 * Detect the current operating system from the browser user agent.
 * Works in Tauri's webview without Node.js `os` module.
 */
function detectPlatform(): OperatingSystem {
	const ua = navigator.userAgent.toLowerCase();
	if (ua.includes("linux")) return "linux";
	if (ua.includes("win")) return "windows";
	if (ua.includes("mac")) return "macos";
	return "other";
}

export const PLATFORM = detectPlatform();

export type OperatingSystem = "linux" | "windows" | "macos" | "other";

export type DisplayServer = "wayland" | "x11" | "other";

/**
 * Matches Rust `DependencyStatus` enum with `#[serde(rename_all = "camelCase")]`.
 * Serializes as a JSON string, not an object.
 */
export type DependencyStatus = "installed" | "notInstalled";

/**
 * Matches Rust `DependencySource` enum with `#[serde(rename_all = "camelCase")]`.
 * Serializes as a JSON string, not an object. `"custom"` is a path the user
 * manually selected via the "Change Path" picker — it always outranks every
 * auto-detected candidate, including an active env-var override.
 */
export type DependencySource = "env" | "managed" | "path" | "custom" | "missing";

/**
 * Matches Rust `DependencyInfo` struct with `#[serde(rename_all = "camelCase")]`.
 * `Option<String>` serializes as `string | null` in JSON.
 */
export type DependencyInfo = {
	name: string;
	status: DependencyStatus;
	source: DependencySource;
	path: string | null;
	version: string | null;
	latestVersion: string | null;
	sizeMb: number | null;
	/**
	 * Exact on-disk byte size of the resolved binary. Preferred over `sizeMb`
	 * for display — `formatSizeBytes` renders it in binary units, so a ~100 KiB
	 * `yt-dlp.exe` reads as "100 KiB" instead of collapsing to "0.1 MB".
	 */
	sizeBytes: number | null;
	sha256: string | null;
	error: string | null;
	/** Whether a working managed copy exists, independent of `source`. */
	managedInstalled: boolean;
	/** Version of the managed copy, if one exists (even when shadowed). */
	managedVersion: string | null;
	/** Path of the managed copy, if one exists (even when shadowed). */
	managedPath: string | null;
	/** Authoritative update flag. Only ever true when `source === "managed"`. */
	updateAvailable: boolean;
};

export type DependencyReport = {
	ffmpeg: DependencyInfo;
	ffprobe: DependencyInfo;
	ytdlp: DependencyInfo;
	allInstalled: boolean;
};

/**
 * Matches Rust `DependencyCandidate` struct with `#[serde(rename_all = "camelCase")]`.
 * One auto-detected path option surfaced by the "Change Path" picker.
 */
export type DependencyCandidate = {
	source: DependencySource;
	path: string;
	version: string | null;
	working: boolean;
	/** On-disk byte size of this candidate binary, when it could be stat'd. */
	sizeBytes: number | null;
};
