// next@16.2.6 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-05-31
'use client';

import type { Window } from '@tauri-apps/api/window';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { openUrl } from "@tauri-apps/plugin-opener";
import { createLucideIcon, LucideMaximize, LucideMinimize, LucideMinus, LucideX, Maximize, Maximize2 } from "lucide-react";
import { useEffect, useState } from "react";

import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Logger } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Loading from "@/app/loading";
import { useWindow } from "@/hooks/use-window";
import { PLATFORM } from "@/lib/window-env";
import { useMaximize } from "@/hooks/use-maximize";
import { getWin } from '@/hooks/get-window';



interface ControlProps {
	onClose: () => void,
	onMinimize: () => void,
	onMaximize: () => void,
	canMaximize?: boolean,
	canMinimize?: boolean,
}

function MacOSControls({
	onClose, onMinimize, onMaximize,
}: ControlProps) {

	const isMaximize = useMaximize();

	return (
		<>
			<Button
				onClick={onClose}
				variant={"ghost"}>
				<LucideX />
			</Button>
			<Button
				onClick={onMaximize}
				variant={"ghost"}>
				{isMaximize
					? <Maximize2 className="w-4 h-4"></Maximize2>
					: <Maximize className="w-4 h-4"></Maximize>
				}
			</Button>
			<Button
				onClick={onMinimize}
				variant={"ghost"}>
				<LucideMinus />
			</Button>

		</>
	)
}

function DefaultControls({
	onClose,
	onMinimize,
	onMaximize,
	canMaximize,
	canMinimize
}: ControlProps) {
	const isMaximize = useMaximize();

	return (
		<>
			<Button
				onClick={onMinimize}
				hidden={!canMinimize}
				variant={"ghost"}>
				<LucideMinus />
			</Button>
			<Button
				onClick={onMaximize}
				hidden={!canMaximize}
				variant={"ghost"}>
				{isMaximize
					? <Maximize2 className="w-4 h-4"></Maximize2>
					: <Maximize className="w-4 h-4"></Maximize>
				}
			</Button>
			<Button
				onClick={onClose}
				variant={"ghost"}>
				<LucideX />
			</Button>
		</>
	)
}

export default function Header() {
	const handleClose = () => getWin().close();
	const handleMinimize = () => getWin().minimize();
	const handleMaximize = () => getWin().toggleMaximize();

	const state = useWindow();
	const isDragRegion = state.status === 'loading' || state.caps.canSetPosition;

	return (
		<div
			className="flex-1 bg-secondary flex w-full h-16 select-none"
			data-tauri-drag-region={isDragRegion}
		>
			<div
				className="sticky border-b border-sidebar-border flex-1 flex items-center text-sm px-2 select-none"
				data-tauri-drag-region={isDragRegion}
			>
				<div className="flex-1 flex justify-end" data-tauri-drag-region>
					{PLATFORM === 'darwin' ? (
						<MacOSControls
							onClose={handleClose}
							onMinimize={handleMinimize}
							onMaximize={handleMaximize}
						/>
					) : (
						<DefaultControls
							onClose={handleClose}
							onMinimize={handleMinimize}
							onMaximize={handleMaximize}
							canMaximize={state.status === 'loading' || state.caps.canMaximize}
							canMinimize={state.status === 'loading' || state.caps.canMinimize}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
