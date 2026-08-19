import { open } from "@tauri-apps/plugin-dialog";

/** Opens the native folder picker, seeded at `defaultPath`. Resolves to the
 *  chosen directory, or `null` if the user cancelled. */
export async function pickDirectory(defaultPath: string): Promise<string | null> {
	const selected = await open({ directory: true, multiple: false, defaultPath: defaultPath || undefined });
	return typeof selected === "string" ? selected : null;
}
