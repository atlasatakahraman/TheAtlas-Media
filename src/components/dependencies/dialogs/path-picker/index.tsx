"use client";

import React from "react";
import {
	AlertTriangle,
	Check,
	CheckCircle2,
	Loader2,
	RefreshCw,
	RotateCcw,
	Route,
	SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	dropCandidateCache,
	getCachedCandidates,
	getSyncCachedCandidates,
} from "@/hooks/use-dependency";
import { get_dependency_candidates, set_dependency_override } from "@/lib/dependency-env";
import { formatSourceLabel, formatToolName } from "@/lib/tool-names";
import { errorMessage, type DependencyCandidate } from "@/lib/types";
import { cn, formatSizeBytes } from "@/lib/utils";
import { formatVersionDisplay } from "@/lib/version";
import { AUTO_PATH, type DependencyPathDialogProps } from "./types";

/**
 * Lets the user pick which detected installation TheAtlas should use for a
 * tool. The choice is persisted backend-side and always outranks
 * auto-detection — including an active `THEATLAS_*_PATH` env override.
 */
const DependencyPathDialog = React.memo(function DependencyPathDialog({
	toolKey,
	currentPath,
	onClose,
	onChanged,
	onOpenBatch,
}: DependencyPathDialogProps) {
	const [candidates, setCandidates] = React.useState<DependencyCandidate[]>(() =>
		toolKey ? (getSyncCachedCandidates(toolKey) ?? []) : []
	);
	const [loadedForKey, setLoadedForKey] = React.useState<string | null>(() =>
		toolKey && getSyncCachedCandidates(toolKey) ? toolKey : null
	);
	const [pendingPath, setPendingPath] = React.useState<string | null>(null);
	const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
	const [error, setError] = React.useState<string | null>(null);

	const isBusy = pendingPath !== null;
	// Derived, not tracked state: "loading" just means the fetch for the
	// currently-open tool hasn't settled yet, either way.
	const isLoading = toolKey !== null && loadedForKey !== toolKey;

	// Reset local UI state whenever the dialog switches tool (or opens).
	// Adjusted during render per React's "you might not need an effect"
	// guidance — this bails out within the same render pass instead of
	// costing an extra commit.
	const [lastToolKey, setLastToolKey] = React.useState(toolKey);
	if (toolKey !== lastToolKey) {
		setLastToolKey(toolKey);
		setError(null);
		const syncCandidates = toolKey ? getSyncCachedCandidates(toolKey) : undefined;
		setCandidates(syncCandidates ?? []);
		setLoadedForKey(syncCandidates ? toolKey : null);
		setSelectedPath(null);
	}

	React.useEffect(() => {
		if (!toolKey) return;
		let cancelled = false;

		// Served from the candidate cache, which is refilled in the background
		// after every dependency refresh. Falls back to a fresh probe.
		getCachedCandidates(toolKey)
			.then((result) => {
				if (!cancelled) setCandidates(result);
			})
			.catch((e: unknown) => {
				if (!cancelled) setError(errorMessage(e));
			})
			.finally(() => {
				if (!cancelled) setLoadedForKey(toolKey);
			});

		return () => {
			cancelled = true;
		};
	}, [toolKey]);

	const applyPath = React.useCallback(
		async (path: string | null) => {
			if (!toolKey) return;
			setPendingPath(path ?? AUTO_PATH);
			setError(null);
			try {
				await set_dependency_override(toolKey, path);
				// The resolved path moved; re-probe on next open.
				dropCandidateCache();
				onChanged();
				onClose();
			} catch (e) {
				setError(errorMessage(e));
			} finally {
				setPendingPath(null);
			}
		},
		[toolKey, onChanged, onClose]
	);

	const handleRescan = React.useCallback(async () => {
		if (!toolKey || isBusy) return;
		setLoadedForKey(null);
		setError(null);
		try {
			setCandidates(await get_dependency_candidates(toolKey, true));
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setLoadedForKey(toolKey);
		}
	}, [toolKey, isBusy]);

	return (
		<Dialog open={!!toolKey} onOpenChange={(open) => !open && !isBusy && onClose()}>
			<DialogContent className="sm:max-w-lg bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
				<DialogHeader className="space-y-1.5 text-left pr-6">
					<DialogTitle className="flex items-center gap-2.5 text-foreground font-serif font-normal text-lg">
						<div className="p-2 rounded-lg bg-secondary text-primary border border-sidebar-border/70 shadow-2xs">
							<Route className="w-4 h-4" />
						</div>
						<span>Change {formatToolName(toolKey ?? "")} Path</span>
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground leading-relaxed">
						Pick which detected installation TheAtlas should use. Your selection always
						takes priority over automatic detection.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2">
					<div className="flex items-center justify-between gap-2 pt-0.5">
						<span className="text-xs font-medium text-muted-foreground">
							Detected Installations
						</span>
						<div className="flex items-center gap-1">
						{onOpenBatch && (
							<Button
								type="button"
								size="xs"
								variant="ghost"
								disabled={isBusy}
								onClick={() => {
									onClose();
									onOpenBatch();
								}}
								className="gap-1 text-xs text-muted-foreground hover:text-foreground h-6 px-2 cursor-pointer rounded-md"
								title="Switch every dependency at once"
							>
								<SlidersHorizontal className="w-3 h-3 text-primary" />
								<span>Change all</span>
							</Button>
						)}
						<Button
							type="button"
							size="xs"
							variant="ghost"
							disabled={isLoading || isBusy}
							onClick={handleRescan}
							className="gap-1 text-xs text-muted-foreground hover:text-foreground h-6 px-2 group/rescan cursor-pointer rounded-md"
							title="Re-scan system for installations"
						>
							<RefreshCw
								className={cn(
									"w-3 h-3 transition-transform duration-500 ease-in-out group-hover/rescan:rotate-180",
									isLoading && "animate-spin"
								)}
							/>
							<span>Rescan</span>
						</Button>
						</div>
					</div>

					{isLoading ? (
						<div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
							<Loader2 className="w-4 h-4 animate-spin" />
							Detecting installations…
						</div>
					) : candidates.length === 0 ? (
						<p className="text-xs text-muted-foreground py-3">
							No other installations were detected.
						</p>
					) : (
						<div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
							{candidates.map((candidate) => {
								const isSelected = candidate.path === selectedPath;
								const isActive =
									selectedPath === null && candidate.path === currentPath;

								return (
									<button
										key={candidate.path}
										type="button"
										disabled={!candidate.working || isBusy}
										aria-pressed={isSelected}
										onClick={() =>
											setSelectedPath(
												candidate.path === selectedPath ? null : candidate.path
											)
										}
										className={cn(
											"w-full text-left rounded-lg border p-2.5 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
											isSelected
												? "border-primary bg-primary/10 ring-1 ring-primary/40"
												: isActive
													? "border-primary/40 bg-primary/5"
													: "border-sidebar-border/60 bg-sidebar/80 hover:bg-sidebar"
										)}
									>
										<div className="flex items-center justify-between gap-2 font-medium text-foreground">
											<span className="flex items-center gap-1.5">
												{(isSelected || isActive) && (
													<CheckCircle2 className="w-3.5 h-3.5 text-chart-1 shrink-0" />
												)}
												{formatSourceLabel(candidate.source)}
											</span>
											{candidate.working ? (
												<span className="flex items-center gap-2 shrink-0">
													{candidate.version && (
														<span className="text-[11px] font-mono text-muted-foreground">
															{formatVersionDisplay(candidate.version)}
														</span>
													)}
													{candidate.sizeBytes != null &&
														candidate.sizeBytes > 0 && (
															<span className="rounded-full bg-primary/10 text-primary border border-primary/20 font-mono text-[10px] px-2 py-0.5 font-medium">
																{formatSizeBytes(candidate.sizeBytes)}
															</span>
														)}
												</span>
											) : (
												<span className="flex items-center gap-1 text-[10px] text-destructive shrink-0">
													<AlertTriangle className="w-3 h-3" />
													Not runnable
												</span>
											)}
										</div>
										<div className="font-mono text-[11px] text-muted-foreground break-all pt-0.5">
											{candidate.path}
										</div>
									</button>
								);
							})}
						</div>
					)}

					{error && (
						<div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 flex items-start gap-2 text-[11px] text-destructive">
							<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
							<span className="break-words">{error}</span>
						</div>
					)}
				</div>

				<DialogFooter className="py-3 border-t border-sidebar-border/60 flex items-center justify-between rounded-lg sm:justify-between">
					<Button
						size="sm"
						variant="ghost"
						disabled={isBusy}
						onClick={() => applyPath(null)}
						className="gap-1.5 justify-center items-center text-xs text-muted-foreground hover:text-foreground rounded-lg font-medium"
					>
						{pendingPath === AUTO_PATH ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<RotateCcw className="w-3.5 h-3.5" />
						)}
						Reset to Automatic
					</Button>
					<Button
						size="sm"
						variant="default"
						disabled={isBusy || selectedPath === null || selectedPath === currentPath}
						onClick={() => applyPath(selectedPath)}
						className="justify-center items-center text-xs rounded-lg font-medium gap-1.5"
					>
						{pendingPath !== null && pendingPath !== AUTO_PATH ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Check className="w-3.5 h-3.5" />
						)}
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});

export default DependencyPathDialog;
