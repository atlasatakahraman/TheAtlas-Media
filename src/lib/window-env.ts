import { invoke } from "@tauri-apps/api/core";

import type { DisplayServer } from "./types";

let _cachedDisplayServer: DisplayServer | null = null;
let _pendingPromise: Promise<DisplayServer> | null = null;

export async function getDisplayServer(): Promise<DisplayServer> {
	if (_cachedDisplayServer) return Promise.resolve(_cachedDisplayServer);

	if (_pendingPromise) return _pendingPromise;

	_pendingPromise = invoke<DisplayServer>('get_display_server').then(ds => {
		_cachedDisplayServer = ds;
		_pendingPromise = null;
		return ds;
	});

	return _pendingPromise;
}

export type WindowCapabilities = {
	displayServer: DisplayServer,
	canSetPosition: boolean,
	canAlwaysOnTOp: boolean,
	canMaximize: boolean,
	canMinimize: boolean,
	canClose: boolean,
}

export async function getWindowCapabilities(): Promise<WindowCapabilities> {
	const ds = await getDisplayServer();
	const isWayland = ds === 'wayland';

	return {
		displayServer: ds,
		canSetPosition: !isWayland,
		canAlwaysOnTOp: !isWayland,
		canMaximize: !isWayland,
		canMinimize: !isWayland,
		canClose: true
	};
}
