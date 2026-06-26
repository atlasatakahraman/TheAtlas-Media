import { invoke } from "@tauri-apps/api/core";

import type { OperatingSystem } from "./types";

let _cachedOperatingSystem: OperatingSystem | null = null;
let _pendingPromise: Promise<OperatingSystem> | null = null;

export async function getOperatingSystem(): Promise<OperatingSystem> {
	if (_cachedOperatingSystem) return Promise.resolve(_cachedOperatingSystem);

	if (_pendingPromise) return _pendingPromise;

	_pendingPromise = invoke<OperatingSystem>('get_operating_system').then(gs => {
		_cachedOperatingSystem = gs;
		_pendingPromise = null;
		return gs;
	})

	return _pendingPromise;

}

export type SystemCapabilities = {
	operatingSystem: OperatingSystem,
}

export async function getSystemCapabilities(): Promise<SystemCapabilities> {
	const gs = await getOperatingSystem();
	return {
		operatingSystem: gs,
	}
}
