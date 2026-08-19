import { invoke } from "@tauri-apps/api/core";

import type { JobSnapshot, MediaProbe, VideoMetadata } from "./types";

/**
 * IPC wrapper for the media job engine (`src-tauri/src/commands/media.rs`).
 */

export type JobId = number;

/** Request shape for `enqueue_download`. Not part of the Rust-mirror block in
 *  `types.ts` — this is a command-argument shape, not a wire response. */
export type DownloadSpec = {
	url: string;
	title: string;
	formatId: string | null;
	audioOnly: boolean;
	outputDir: string;
};

/** Request shape for `enqueue_convert`. */
export type ConvertSpec = {
	inputPath: string;
	outputDir: string;
	container: string;
	videoCodec: string | null;
	audioCodec: string | null;
};

export async function probe_media_url(url: string): Promise<VideoMetadata> {
	return await invoke<VideoMetadata>("probe_media_url", { url });
}

export async function probe_media_file(path: string): Promise<MediaProbe> {
	return await invoke<MediaProbe>("probe_media_file", { path });
}

export async function enqueue_download(spec: DownloadSpec): Promise<JobId> {
	return await invoke<JobId>("enqueue_download", { spec });
}

export async function enqueue_convert(spec: ConvertSpec): Promise<JobId> {
	return await invoke<JobId>("enqueue_convert", { spec });
}

export async function cancel_media_job(id: JobId): Promise<boolean> {
	return await invoke<boolean>("cancel_media_job", { id });
}

export async function list_media_jobs(): Promise<JobSnapshot[]> {
	return await invoke<JobSnapshot[]>("list_media_jobs");
}

export async function get_media_history(): Promise<JobSnapshot[]> {
	return await invoke<JobSnapshot[]>("get_media_history");
}

export async function clear_media_history(): Promise<void> {
	return await invoke("clear_media_history");
}

export async function set_media_concurrency(value: number): Promise<void> {
	return await invoke("set_media_concurrency", { value });
}

export async function get_default_media_output_dir(): Promise<string> {
	return await invoke<string>("get_default_media_output_dir");
}

export async function reveal_output_file(path: string): Promise<void> {
	return await invoke("reveal_output_file", { path });
}
