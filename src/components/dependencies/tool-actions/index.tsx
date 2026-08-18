"use client";

import { Download, Loader2, RefreshCw, Route, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolActionsProps } from "./types";

/**
 * The contextual buttons on a tool card.
 *
 * Exactly one primary action is offered at a time, chosen by what the tool's
 * current state actually permits — a managed binary can be updated and removed,
 * an external one can only be supplemented with a managed copy. "Change Path"
 * is additive and appears alongside whichever primary action is showing,
 * whenever there is genuinely a choice of installation to make.
 */
export default function ToolActions({
	toolKey,
	state,
	mounted,
	isUninstalling,
	onInstallClick,
	onUninstallClick,
	onInstallManagedClick,
	onChangePathClick,
}: ToolActionsProps) {
	const { isInstalling, isInstalled, isManaged, isExternal, isShadowingManaged, hasTwoPaths } =
		state;

	return (
		<div className="flex items-center gap-2 shrink-0 sm:self-start">
			{isInstalling ? (
				<Button
					size="sm"
					variant="ghost"
					disabled
					className="gap-1.5 text-xs rounded-md font-medium"
				>
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
					Installing…
				</Button>
			) : isUninstalling ? (
				<Button
					size="sm"
					variant="ghost"
					disabled
					className="gap-1.5 text-xs rounded-md font-medium"
				>
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
					Uninstalling…
				</Button>
			) : isManaged ? (
				<>
					<Button
						size="sm"
						variant="ghost"
						disabled={!mounted}
						onClick={() => onInstallClick(toolKey)}
						className="group/link h-auto p-0 text-xs text-muted-foreground hover:text-foreground bg-transparent hover:bg-transparent active:bg-transparent focus:bg-transparent focus-visible:bg-transparent shadow-none font-medium rounded-none outline-none ring-0 focus-visible:ring-0"
					>
						<span className="inline-flex items-center gap-1.5 border-b border-transparent group-hover/link:border-current pb-[2px] transition-colors">
							<RefreshCw className="w-3.5 h-3.5 transition-transform duration-500 ease-in-out group-hover/link:rotate-180" />
							<span>Reinstall / Update</span>
						</span>
					</Button>
					<Button
						size="sm"
						variant="destructive"
						onClick={() => onUninstallClick(toolKey)}
						className="gap-1.5 text-xs rounded-md font-medium group"
					>
						<Trash2 className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-115" />
						Uninstall
					</Button>
				</>
			) : !isInstalled ? (
				<Button
					size="sm"
					variant="default"
					disabled={!mounted}
					onClick={() => onInstallClick(toolKey)}
					className="gap-1.5 text-xs rounded-md font-medium group"
				>
					<Download className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:translate-y-[1px]" />
					Install
				</Button>
			) : isShadowingManaged ? (
				/* An env override is winning while a managed copy sits unused
				   underneath it — offer to clear the managed copy away. */
				<Button
					size="sm"
					variant="destructive"
					disabled={!mounted}
					onClick={() => onUninstallClick(toolKey)}
					className="gap-1.5 text-xs rounded-md font-medium group"
				>
					<Trash2 className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-115" />
					Uninstall Managed Copy
				</Button>
			) : isExternal && !state.hasManagedPath ? (
				/* External install with no managed copy anywhere — never
				   auto-updated. Offer one TheAtlas will own and keep current.
				   Skipped when a managed path already exists, because "Change
				   Path" already lets the user switch to it. */
				<Button
					size="sm"
					variant="outline"
					disabled={!mounted}
					onClick={() => onInstallManagedClick(toolKey)}
					className="gap-1.5 text-xs rounded-md font-medium group"
				>
					<Download className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:translate-y-[1px]" />
					Install Managed Copy
				</Button>
			) : null}

			{!isInstalling && hasTwoPaths && (
				<Button
					size="sm"
					variant="outline"
					disabled={!mounted}
					onClick={() => onChangePathClick(toolKey)}
					className="gap-1.5 text-xs rounded-md font-medium"
				>
					<Route className="w-3.5 h-3.5" />
					Change Path
				</Button>
			)}
		</div>
	);
}
