"use client";

import React from "react";
import {
	AlertTriangle,
	ArrowRight,
	Check,
	CheckCircle2,
	Layers,
	Loader2,
	Package,
	RefreshCw,
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
import { dropCandidateCache, getCachedCandidates } from "@/hooks/use-dependency";
import { get_dependency_candidates, set_all_dependency_overrides } from "@/lib/dependency-env";
import { errorMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
	currentMode,
	impactRows,
	installNameFor,
	overridesFor,
	strategies,
	toolKeys,
} from "./functions";
import type {
	BatchSourceMode,
	CandidatesByTool,
	DependencyBatchPathDialogProps,
} from "./types";

/**
 * Switches every dependency to one source in a single action.
 *
 * The per-tool picker answers "which ffmpeg?"; this answers "use my system
 * tools" or "use the ones you manage", which is the question people actually
 * arrive with and which used to take three trips through the other dialog.
 *
 * Every decision here is a pure function in `functions.ts` — this file is the
 * fetch, the selection state, and the markup.
 */
const DependencyBatchPathDialog = React.memo(function DependencyBatchPathDialog({
	open,
	dependencies,
	onClose,
	onChanged,
}: DependencyBatchPathDialogProps) {
	const [candidates, setCandidates] = React.useState<CandidatesByTool>({});
	const [isLoading, setIsLoading] = React.useState(true);
	const [isApplying, setIsApplying] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const active = currentMode(dependencies);
	const [selected, setSelected] = React.useState<BatchSourceMode>(active);

	// Reset on open, adjusted during render rather than in an effect — this
	// settles in the same pass instead of costing a second commit.
	const [wasOpen, setWasOpen] = React.useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setSelected(active);
			setError(null);
		}
	}

	const load = React.useCallback(async (refresh: boolean) => {
		setIsLoading(true);
		setError(null);
		try {
			const keys = toolKeys();
			// Concurrent: each probe spawns binaries, so in sequence this is the
			// sum over every tool rather than the slowest one.
			const results = await Promise.all(
				keys.map((key) =>
					refresh
						? get_dependency_candidates(installNameFor(key), true)
						: getCachedCandidates(installNameFor(key)),
				),
			);
			setCandidates(Object.fromEntries(keys.map((key, i) => [key, results[i]])));
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setIsLoading(false);
		}
	}, []);

	React.useEffect(() => {
		if (!open) return;
		// No cancellation guard: `load` only writes this component's own state,
		// and the component stays mounted while closed (the page always renders
		// it), so a late resolve just warms the next open.
		void load(false);
	}, [open, load]);

	const options = strategies(candidates, dependencies);
	const rows = impactRows(candidates, dependencies, selected);

	const handleApply = React.useCallback(async () => {
		setIsApplying(true);
		setError(null);
		try {
			await set_all_dependency_overrides(overridesFor(candidates, selected));
			dropCandidateCache();
			onChanged();
			onClose();
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setIsApplying(false);
		}
	}, [candidates, selected, onChanged, onClose]);

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isApplying && onClose()}>
			<DialogContent className="sm:max-w-2xl bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
				<DialogHeader className="space-y-1.5 text-left pr-6">
					<DialogTitle className="flex items-center gap-2.5 text-foreground font-serif font-normal text-lg">
						<div className="p-2 rounded-lg bg-secondary text-primary border border-sidebar-border/70 shadow-2xs">
							<SlidersHorizontal className="w-4 h-4" />
						</div>
						<span>Change All Dependency Paths</span>
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground leading-relaxed">
						Switch every dependency to the same source in one step. Your choice always
						takes priority over automatic detection.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
					<div className="flex items-center justify-between gap-2 pt-0.5">
						<span className="text-xs font-medium text-foreground">
							Select a source
						</span>
						<Button
							type="button"
							size="xs"
							variant="ghost"
							disabled={isLoading || isApplying}
							onClick={() => void load(true)}
							className="gap-1 text-xs text-muted-foreground hover:text-foreground h-6 px-2 group/rescan cursor-pointer rounded-md"
							title="Re-scan the system for installations"
						>
							<RefreshCw
								className={cn(
									"w-3 h-3 transition-transform duration-500 ease-in-out group-hover/rescan:rotate-180",
									isLoading && "animate-spin",
								)}
							/>
							<span>Rescan</span>
						</Button>
					</div>

					<div className="space-y-2">
						{options.map((option) => {
							const isSelected = selected === option.id;
							return (
								<button
									key={option.id}
									type="button"
									disabled={!option.available || isApplying}
									aria-pressed={isSelected}
									onClick={() => setSelected(option.id)}
									className={cn(
										"w-full flex items-center justify-between gap-3 rounded-xl border p-3 text-left text-xs transition-colors cursor-pointer",
										isSelected
											? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs"
											: "border-sidebar-border/60 bg-sidebar/80 hover:bg-sidebar",
										!option.available && "opacity-50 cursor-not-allowed",
									)}
								>
									<div className="flex items-center gap-3 min-w-0">
										<div
											className={cn(
												"p-2 rounded-lg border shrink-0",
												isSelected
													? "bg-primary text-primary-foreground border-primary/20"
													: "bg-secondary text-primary border-sidebar-border/70",
											)}
										>
											{React.createElement(option.icon, {
												className: "w-4 h-4",
											})}
										</div>
										<div className="space-y-0.5 min-w-0">
											<div className="flex items-center gap-2 font-medium text-foreground">
												<span>{option.title}</span>
												{isSelected && (
													<CheckCircle2 className="w-3.5 h-3.5 text-chart-1 shrink-0" />
												)}
											</div>
											<p className="text-[11px] text-muted-foreground leading-relaxed">
												{option.description}
											</p>
										</div>
									</div>
									<span
										className={cn(
											"shrink-0 rounded-full border text-[10px] font-mono px-2.5 py-0.5 font-medium shadow-2xs whitespace-nowrap",
											option.isCurrent
												? "bg-chart-1/10 text-chart-1 border-chart-1/30"
												: "bg-muted text-muted-foreground border-border",
										)}
									>
										{option.badge}
									</span>
								</button>
							);
						})}
					</div>

					<div className="rounded-xl border border-sidebar-border bg-background/60 p-3 space-y-2.5">
						<div className="flex items-center justify-between gap-2 pb-1.5 border-b border-sidebar-border/60 text-xs font-medium text-foreground">
							<div className="flex items-center gap-1.5">
								<Layers className="w-3.5 h-3.5 text-primary" />
								<span>What will change</span>
							</div>
							<span className="text-[11px] text-muted-foreground font-mono font-normal">
								{rows.length} dependencies
							</span>
						</div>

						{isLoading ? (
							<div className="flex items-center justify-center gap-2 py-5 text-xs text-muted-foreground">
								<Loader2 className="w-4 h-4 animate-spin text-primary" />
								<span>Scanning for installations…</span>
							</div>
						) : (
							<div className="space-y-2 pt-0.5">
								{rows.map((row) => (
									<div
										key={row.toolKey}
										className="w-full rounded-xl border border-sidebar-border/60 bg-sidebar/80 p-3 space-y-2 text-left text-xs text-foreground"
									>
										<div className="flex items-center justify-between gap-2 font-medium">
											<div className="flex items-center gap-2">
												<Package className="w-4 h-4 text-primary shrink-0" />
												<span className="font-medium text-sm">
													{row.name}
												</span>
											</div>
											{row.missing ? (
												<span className="rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[10px] px-2 py-0.5 font-mono">
													Not found
												</span>
											) : (
												<span className="rounded-full bg-chart-1/10 text-chart-1 border border-chart-1/30 text-[10px] px-2.5 py-0.5 font-mono font-medium flex items-center gap-1">
													<CheckCircle2 className="w-3 h-3" />
													Ready
												</span>
											)}
										</div>

										<div className="flex items-center gap-2 pl-6 font-mono text-[11px]">
											<span
												className="bg-background/60 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground truncate max-w-[220px]"
												title={row.fromLabel}
											>
												{row.fromLabel}
											</span>
											<ArrowRight className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
											<span
												className={cn(
													"px-2 py-0.5 rounded-md border font-medium truncate max-w-[260px]",
													row.missing
														? "bg-destructive/10 border-destructive/20 text-destructive"
														: "bg-primary/10 border-primary/20 text-foreground",
												)}
												title={row.toLabel}
											>
												{row.toLabel}
											</span>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					{error && (
						<div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 flex items-start gap-2 text-[11px] text-destructive">
							<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
							<span className="break-words">{error}</span>
						</div>
					)}
				</div>

				<DialogFooter className="pt-4 -mb-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={isApplying}
						onClick={onClose}
						className="text-xs text-muted-foreground hover:text-foreground rounded-md"
					>
						Cancel
					</Button>
					<Button
						type="button"
						size="sm"
						variant="default"
						disabled={isApplying || isLoading}
						onClick={() => void handleApply()}
						className="rounded-md px-4 py-2 text-xs font-medium gap-1.5 shadow-xs"
					>
						{isApplying ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Check className="w-3.5 h-3.5" />
						)}
						Apply to all
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});

export default DependencyBatchPathDialog;
