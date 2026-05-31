'use client';


import { Logger } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";

export const is_wayland = async () => {
	const way = await invoke('is_wayland');
	way ? Logger.done("Display Server is running under the WAYLAND") : null;
	return way;
}
