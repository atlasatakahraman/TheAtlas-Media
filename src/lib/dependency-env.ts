import { invoke } from "@tauri-apps/api/core";

import type { DependencyReport } from "./types";

export async function get_dependencies(): Promise<DependencyReport> {
	return await invoke<DependencyReport>("check_dependencies");
}

export async function get_ffmpeg_path(): Promise<string | null> {
	return (await get_dependencies()).ffmpeg.path;
}

export async function install_dependency(name: string): Promise<void> {
	return await invoke("install_dependency", { name });
}

export async function install_all_missing(): Promise<void> {
	return await invoke("install_all_missing");
}

export async function uninstall_dependency(name: string): Promise<void> {
	return await invoke("uninstall_dependency", { name });
}
