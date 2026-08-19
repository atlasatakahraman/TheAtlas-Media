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

/**
 * Any value the backend KV store round-trips. `serde_json::Value` on the Rust
 * side, so the two agree on exactly this set.
 */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/**
 * Mirrors Rust `AppError` (`src-tauri/src/error.rs`), which serializes
 * adjacently tagged: `{ "kind": "verification", "message": "…" }`.
 *
 * Every command rejects with this shape. Switch on `kind` and treat `message`
 * as display text only — the tags are the contract, the prose is not.
 *
 * Paths in `message` have the user's home directory rewritten to `~` by the
 * backend, so an error is safe to show, log, or screenshot.
 */
export type AppErrorKind =
	| "validation"
	| "notFound"
	| "io"
	| "subprocess"
	| "network"
	| "verification"
	| "extraction"
	| "unsupportedPlatform"
	| "internal";

export type AppError = {
	kind: AppErrorKind;
	/** Absent for `unsupportedPlatform`, which carries no detail. */
	message?: string;
};

const APP_ERROR_KINDS = new Set<string>([
	"validation",
	"notFound",
	"io",
	"subprocess",
	"network",
	"verification",
	"extraction",
	"unsupportedPlatform",
	"internal",
]);

/**
 * Narrow an unknown rejection to a typed backend error.
 *
 * `invoke()` rejects with whatever the command serialized, typed as `unknown`.
 * A rejection can also be a transport failure or a thrown `Error`, so this
 * checks the shape rather than assuming it.
 */
export function isAppError(error: unknown): error is AppError {
	if (typeof error !== "object" || error === null) return false;
	const kind = (error as { kind?: unknown }).kind;
	return typeof kind === "string" && APP_ERROR_KINDS.has(kind);
}

/**
 * Something safe to put in a toast, whatever went wrong.
 *
 * Prefer switching on `isAppError(e) && e.kind` when the response should
 * differ by cause; this is the fallback for "just tell the user".
 */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
	if (isAppError(error)) {
		if (error.message) return error.message;
		return error.kind === "unsupportedPlatform"
			? "This platform is not supported"
			: fallback;
	}
	if (error instanceof Error) return error.message;
	if (typeof error === "string" && error.trim()) return error;
	return fallback;
}

/**
 * Matches Rust `JobKind` enum with `#[serde(rename_all = "camelCase")]`
 * (`src-tauri/src/core/media/types.rs`).
 */
export type JobKind = "download" | "convert";

/**
 * Matches Rust `JobStatus` enum with `#[serde(rename_all = "camelCase")]`.
 */
export type JobStatus = "queued" | "running" | "finalizing" | "completed" | "failed" | "cancelled";

/**
 * Matches Rust `JobProgress` struct with `#[serde(rename_all = "camelCase")]`.
 * `percent: null` means render indeterminate — either the phase has no
 * notion of a percentage, or the total size is not known yet.
 */
export type JobProgress = {
	percent: number | null;
	downloadedBytes: number | null;
	totalBytes: number | null;
	speedBps: number | null;
	etaSecs: number | null;
	message: string;
};

/**
 * Matches Rust `JobSnapshot` struct with `#[serde(rename_all = "camelCase")]`.
 */
export type JobSnapshot = {
	id: number;
	kind: JobKind;
	status: JobStatus;
	title: string;
	progress: JobProgress;
	outputPath: string | null;
	error: string | null;
	queuedAt: number;
	startedAt: number | null;
	finishedAt: number | null;
};

/**
 * Matches Rust `VideoFormat` struct with `#[serde(rename_all = "camelCase")]`.
 */
export type VideoFormat = {
	formatId: string;
	ext: string;
	resolution: string | null;
	fps: number | null;
	vcodec: string | null;
	acodec: string | null;
	filesizeBytes: number | null;
	tbrKbps: number | null;
};

/**
 * Matches Rust `VideoMetadata` struct with `#[serde(rename_all = "camelCase")]`.
 */
export type VideoMetadata = {
	id: string;
	title: string;
	durationSecs: number | null;
	thumbnailUrl: string | null;
	uploader: string | null;
	formats: VideoFormat[];
};

/**
 * Matches Rust `MediaProbe` struct with `#[serde(rename_all = "camelCase")]`.
 */
export type MediaProbe = {
	durationSecs: number | null;
	container: string | null;
	videoCodec: string | null;
	audioCodec: string | null;
	width: number | null;
	height: number | null;
};
