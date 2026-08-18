"use client";

import { Download, Loader2, RefreshCw, Route, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSizeMb } from "@/lib/utils";
import { CACHE_CLEAR_THRESHOLD_MB, CACHE_DISPLAY_FLOOR_MB } from "./data";
import type { DependencyActionBarProps } from "./types";

/** Page-level actions: cache, path re-scan, update check, install-all. */
export default function DependencyActionBar({
	mounted,
	isLoading,
	isAnyInstalling,
	webviewCacheMb,
	isClearingCache,
	onClearCacheClick,
	isCheckingPaths,
	onCheckPaths,
	isCheckingUpdates,
	onCheckUpdates,
	allManagedInstalled,
	onInstallAllManagedClick,
}: DependencyActionBarProps) {
	const cacheMeasured = webviewCacheMb !== null;
	const canClearCache = cacheMeasured && webviewCacheMb >= CACHE_CLEAR_THRESHOLD_MB;
	// The two checks and any install contend for the same backend probes.
	const checksBusy = isCheckingPaths || isCheckingUpdates || isAnyInstalling;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				variant={canClearCache ? "destructive" : "outline"}
				size="sm"
				disabled={isClearingCache || !canClearCache}
				onClick={onClearCacheClick}
				title={
					cacheMeasured && !canClearCache
						? `Requires ≥ ${CACHE_CLEAR_THRESHOLD_MB} MiB to clear (current: ${formatSizeMb(webviewCacheMb)})`
						: undefined
				}
				className="gap-1.5 rounded-md text-xs font-medium"
			>
				{isClearingCache ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
				) : (
					<Trash2 className="w-3.5 h-3.5" />
				)}
				Clear Cache
				{cacheMeasured && webviewCacheMb > CACHE_DISPLAY_FLOOR_MB && (
					<span className="text-muted-foreground font-normal">
						({formatSizeMb(webviewCacheMb)})
					</span>
				)}
			</Button>

			<Button
				variant="outline"
				size="sm"
				disabled={checksBusy}
				onClick={onCheckPaths}
				title="Manually re-scan all dependency paths across the system"
				className="gap-1.5 border-border rounded-md text-xs font-medium group/check-paths"
			>
				{isCheckingPaths ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
				) : (
					<Route className="w-3.5 h-3.5 transition-transform duration-300 ease-out group-hover/check-paths:scale-115" />
				)}
				Check Paths
			</Button>

			<Button
				variant="outline"
				size="sm"
				disabled={checksBusy}
				onClick={onCheckUpdates}
				className="gap-1.5 border-border rounded-md text-xs font-medium group/check-tools"
			>
				{isCheckingUpdates ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
				) : (
					<RefreshCw className="w-3.5 h-3.5 transition-transform duration-500 ease-in-out group-hover/check-tools:rotate-180" />
				)}
				Check Tools
			</Button>

			<Button
				size="sm"
				disabled={!mounted || isLoading || isAnyInstalling}
				onClick={onInstallAllManagedClick}
				title="Download and install official managed binaries for all dependencies"
				className="gap-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium group"
			>
				{isAnyInstalling ? (
					<>
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						Installing…
					</>
				) : (
					<>
						<Download className="w-3.5 h-3.5 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:translate-y-[1px]" />
						{allManagedInstalled ? "Reinstall All Managed" : "Install All Managed"}
					</>
				)}
			</Button>
		</div>
	);
}
