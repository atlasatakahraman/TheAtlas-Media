import { invoke } from "@tauri-apps/api/core";

export const IS_DEBUG_MODE: boolean =
	process.env.ENABLE_DEBUG === "1" ||
	process.env.NEXT_PUBLIC_ENABLE_DEBUG === "1";

export async function openDevtools(): Promise<void> {
	if (!IS_DEBUG_MODE) return;
	try {
		await invoke("open_devtools");
	} catch (err) {
		console.warn("DevTools could not be opened via IPC:", err);
	}
}
