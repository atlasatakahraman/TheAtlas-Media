import { invoke } from "@tauri-apps/api/core";

import type { DependencyCandidate, DependencyInfo, DependencyReport } from "./types";

export async function get_dependencies(): Promise<DependencyReport> {
	return await invoke<DependencyReport>("check_dependencies");
}

export async function check_dependency_paths(): Promise<DependencyReport> {
	return await invoke<DependencyReport>("check_dependency_paths");
}

export async function get_ffmpeg_path(): Promise<string | null> {
	return (await get_dependencies()).ffmpeg.path;
}

export async function install_dependency(name: string): Promise<void> {
	return await invoke("install_dependency", { name });
}

export async function install_tools(names: string[]): Promise<void> {
	return await invoke("install_tools", { names });
}

export async function install_all_missing(): Promise<void> {
	return await invoke("install_all_missing");
}

/** Download size of a tool's release archive, in MB. 0 when unknown. */
export async function get_download_size_mb(name: string): Promise<number> {
	return await invoke<number>("get_download_size_mb", { name });
}

/** Asks the backend to re-check upstream releases. `force` skips its own TTL. */
export async function check_for_updates(force: boolean): Promise<void> {
	return await invoke("check_for_updates", { force });
}

export async function uninstall_dependency(name: string): Promise<void> {
	return await invoke("uninstall_dependency", { name });
}

export async function get_app_storage_path(): Promise<string> {
	return await invoke<string>("get_app_storage_path");
}

export async function open_app_storage_dir(): Promise<string> {
	return await invoke<string>("open_app_storage_dir");
}

export async function reveal_dependency_path(path: string): Promise<void> {
	return await invoke("reveal_dependency_path", { path });
}

export async function get_dependency_candidates(
	name: string,
	refresh?: boolean,
): Promise<DependencyCandidate[]> {
	return await invoke<DependencyCandidate[]>("get_dependency_candidates", {
		name,
		...(refresh !== undefined && { refresh }),
	});
}

export async function set_dependency_override(
	name: string,
	path: string | null,
): Promise<DependencyInfo> {
	return await invoke<DependencyInfo>("set_dependency_override", { name, path });
}

export async function get_app_storage_size_mb(): Promise<number> {
	return await invoke<number>("get_app_storage_size_mb");
}

export async function get_webkit_cache_size_mb(): Promise<number> {
	return await invoke<number>("get_webkit_cache_size_mb");
}

export async function clear_webkit_cache(): Promise<number> {
	return await invoke<number>("clear_webkit_cache");
}

