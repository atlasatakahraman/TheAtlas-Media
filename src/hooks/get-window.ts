import { Window, getCurrentWindow } from "@tauri-apps/api/window";

export const getWin = (() => {
	let cached: Window | null = null;
	return (): Window => {
		cached ??= getCurrentWindow();
		return cached;
	};
})();
