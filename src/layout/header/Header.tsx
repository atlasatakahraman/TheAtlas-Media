// next@16.2.6 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-05-31
'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { openUrl } from "@tauri-apps/plugin-opener";
import { createLucideIcon, LucideMaximize, LucideMinimize, LucideMinus, LucideX } from "lucide-react";
import { useEffect, useState } from "react";

import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Logger } from "@/lib/utils";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { is_wayland } from "@/hooks/use-wayland";

export default function Header() {

	const [maximized, setMaximized] = useState(false);
	const [wayland, setWayland] = useState<boolean>(false);

	useEffect(() => {
		const handle = async () => {
			const isWayland = await is_wayland();
			setWayland(isWayland as boolean);
		}
		handle();


	}, []); // Added empty dependency array

	useEffect(() => {
		const appWindow = getCurrentWindow();

		// Initial check
		appWindow.isMaximized().then(setMaximized);

		// Listen for window resize events
		const unlistenPromise = appWindow.onResized(async () => {
			const isMax = await appWindow.isMaximized();
			setMaximized(isMax);
		});

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, []);

	const ResizeIcon = maximized ? LucideMinimize : LucideMaximize;

	if (typeof window === undefined) return null;

	return (
		<div className="flex-1 bg-secondary flex w-full h-16">
			<div className="sticky border-b border-sidebar-border flex-1 flex items-center text-sm px-2">
				<div className="flex-1 flex justify-end">

					<Button
						onClick={() => getCurrentWindow().minimize()}
						variant={"ghost"}
						className="hover:cursor-pointer text-primary hover:bg-sidebar-primary/10 active:bg-sidebar-primary/15 hover:text-sidebar-accent-foreground">
						<LucideMinus />
					</Button>

					{!wayland && (
						<Button
							onClick={() => getCurrentWindow().toggleMaximize()}
							variant={"ghost"}
							className="hover:cursor-pointer text-primary hover:bg-sidebar-primary/10 active:bg-sidebar-primary/15 hover:text-sidebar-accent-foreground">
							<ResizeIcon />
						</Button>
					)}

					<Button
						onClick={() => getCurrentWindow().close()}
						variant={"ghost"}
						className="hover:cursor-pointer text-primary hover:bg-sidebar-primary/10 active:bg-sidebar-primary/15 hover:text-sidebar-accent-foreground">
						<LucideX />
					</Button>

				</div>
			</div>
		</div>
	)
}
