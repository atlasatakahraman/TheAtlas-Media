"use client";

import { useCallback } from "react";
import { LucideMinus, LucideX, Maximize, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWin } from "@/hooks/get-window";
import { useMaximize } from "@/hooks/use-maximize";
import { useWindow } from "@/hooks/use-window";
import { PLATFORM } from "@/lib/types";
import type { WindowControlProps } from "./types";

function MaximizeIcon() {
	const isMaximize = useMaximize();
	const Icon = isMaximize ? Maximize2 : Maximize;
	return <Icon className="w-4 h-4 transition-transform duration-200 ease-out group-hover:scale-125" />;
}

function MacOSControls({ onClose, onMinimize, onMaximize }: WindowControlProps) {
	return (
		<>
			<Button onClick={onClose} variant="ghost" className="group">
				<LucideX className="transition-transform duration-200 ease-out group-hover:scale-125 group-hover:rotate-90" />
			</Button>
			<Button onClick={onMaximize} variant="ghost" className="group">
				<MaximizeIcon />
			</Button>
			<Button onClick={onMinimize} variant="ghost" className="group">
				<LucideMinus className="transition-transform duration-200 ease-out group-hover:scale-125" />
			</Button>
		</>
	);
}

function DefaultControls({
	onClose,
	onMinimize,
	onMaximize,
	canMaximize,
	canMinimize,
	loading,
}: WindowControlProps) {
	if (loading) return null;

	return (
		<div className="flex *:duration-500 *:animate-in *:slide-in-from-top-9 *:fade-in-0 *:transition-[opacity,transform] *:ease-out">
			<div>
				<Button onClick={onMinimize} hidden={!canMinimize} variant="ghost" className="group">
					<LucideMinus className="transition-transform duration-200 ease-out group-hover:scale-125" />
				</Button>
			</div>
			<div>
				<Button onClick={onMaximize} hidden={!canMaximize} variant="ghost" className="group">
					<MaximizeIcon />
				</Button>
			</div>
			<div>
				<Button
					onClick={onClose}
					variant="ghost"
					className="group hover:bg-destructive/15 hover:text-destructive"
				>
					<LucideX className="transition-transform duration-200 ease-out group-hover:scale-125 group-hover:rotate-90" />
				</Button>
			</div>
		</div>
	);
}

/**
 * Frameless-window buttons.
 *
 * Capability flags come from `useWindow()` rather than being assumed: on
 * Wayland, maximize and position are no-ops by design, so the buttons hide
 * instead of appearing dead.
 */
export default function WindowControls() {
	const windowState = useWindow();

	const onClose = useCallback(() => getWin().close(), []);
	const onMinimize = useCallback(() => getWin().minimize(), []);
	const onMaximize = useCallback(() => getWin().toggleMaximize(), []);

	if (PLATFORM === "macos") {
		return <MacOSControls onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} />;
	}

	// Compared inline rather than through a `loading` boolean so TypeScript
	// narrows the discriminated union and `caps` is only read when it exists.
	return (
		<DefaultControls
			onClose={onClose}
			onMinimize={onMinimize}
			onMaximize={onMaximize}
			canMaximize={windowState.status === "loading" || windowState.caps.canMaximize}
			canMinimize={windowState.status === "loading" || windowState.caps.canMinimize}
			loading={windowState.status === "loading"}
		/>
	);
}
