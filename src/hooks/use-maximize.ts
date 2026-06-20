
'use client';

import { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

export function useMaximize(): boolean {

	const [isMaximized, setIsMaximized] = useState<boolean>(false);

	useEffect(() => {
		let unlisten: UnlistenFn | undefined;
		let cancelled: boolean = false;

		async function setup() {
			const win = await getCurrentWindow();
			const initial = await win.isMaximized();
			if (!cancelled) setIsMaximized(initial);

			unlisten = await win.onResized(async () => {
				const maximized = await win.isMaximized();
				if (!cancelled) setIsMaximized(maximized);
			})
		}

		setup();

		return () => {
			cancelled = true;
			unlisten?.();
		}
	}, [])

	return isMaximized;
}
