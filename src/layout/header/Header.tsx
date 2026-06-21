// next@16.2.6 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-05-31
'use client';


import { Button } from "@/components/ui/button";

import { LucideMinus, LucideX, Maximize, Maximize2 } from "lucide-react";

import { useWindow } from "@/hooks/use-window";
import { PLATFORM } from "@/lib/window-env";
import { useMaximize } from "@/hooks/use-maximize";
import { getWin } from '@/hooks/get-window';
import { YoutubeLoadingSvg } from "@/app/loading";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";



interface ControlProps {
	onClose: () => void,
	onMinimize: () => void,
	onMaximize: () => void,
	canMaximize?: boolean,
	canMinimize?: boolean,
	loading?: boolean,
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
	canMinimize,
	loading
}: ControlProps) {
	const isMaximize = useMaximize();

	if (loading) return null;

	return (
		<div className="flex *:duration-500 *:animate-in *:slide-in-from-top-9 *:fade-in-0 *:transition-all *:ease-out">
			<div>
				<Button
					onClick={onMinimize}
					hidden={!canMinimize}
					variant={"ghost"}>
					<LucideMinus />
				</Button>

			</div>
			<div>
				<Button
					onClick={onMaximize}

					hidden={!canMaximize}
					variant={"ghost"}>
					{isMaximize
						? <Maximize2 className="w-4 h-4"></Maximize2>
						: <Maximize className="w-4 h-4"></Maximize>
					}
				</Button>

			</div>
			<div>
				<Button
					onClick={onClose}
					variant={"ghost"}>
					<LucideX />
				</Button>
			</div>
		</div>
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
				className='sticky flex-1 flex items-center text-sm px-2 select-none border-b border-sidebar-border'
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
							loading={state.status === 'loading'}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
