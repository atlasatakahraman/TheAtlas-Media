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
 * Serializes as a JSON string, not an object.
 */
export type DependencySource = "env" | "managed" | "path" | "missing";

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
	error: string | null;
};

export type DependencyReport = {
	ffmpeg: DependencyInfo;
	ffprobe: DependencyInfo;
	ytdlp: DependencyInfo;
	allInstalled: boolean;
};
