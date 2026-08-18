// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { dropCandidateCache, getCachedCandidates, getSyncCachedCandidates } from "@/hooks/use-dependency";
import type { ConfirmTarget } from "@/hooks/use-install";
import { get_dependency_candidates, set_all_dependency_overrides, set_dependency_override } from "@/lib/dependency-env";
import { formatSourceLabel, formatToolName, getToolDisabledImpact } from "@/lib/tool-names";
import type { DependencyCandidate, DependencyReport } from "@/lib/types";
import { cn, formatSizeBytes, formatSizeMb } from "@/lib/utils";
import { formatVersionDisplay } from "@/lib/version";
import {
	AlertTriangle,
	ArrowRight,
	Check,
	CheckCircle2,
	Copy,
	Download,
	HardDrive,
	Layers,
	Loader2,
	Package,
	RefreshCw,
	RotateCcw,
	Route,
	ShieldAlert,
	ShieldCheck,
	SlidersHorizontal,
	Sparkles,
	Terminal,
	Trash2,
} from "lucide-react";
import React from "react";

// ── Inline shimmer skeleton for async-loading size values ─────────────────
function SizeShimmer() {
	return (
		<span className="inline-block w-12 h-3.5 rounded-full bg-primary/10 animate-pulse" />
	);
}

function SizeDisplay({ sizeMb }: { sizeMb: number | undefined }) {
	if (sizeMb === undefined || sizeMb <= 0) return <SizeShimmer />;
	return <>{formatSizeMb(sizeMb)}</>;
}

export interface DependencyInstallDialogProps {
	confirmTarget: ConfirmTarget | null;
	onClose: () => void;
	onConfirm: () => void;
}

export const DependencyInstallDialog = React.memo(function DependencyInstallDialog({
	confirmTarget,
	onClose,
	onConfirm,
}: DependencyInstallDialogProps) {
	return (
		<AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent className="sm:max-w-xl bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6  space-y-4">
				<AlertDialogHeader className="space-y-1.5 text-left">
					<AlertDialogTitle className="flex items-center gap-2.5 text-foreground font-serif font-normal text-lg">
						<div className="p-2 rounded-lg bg-secondary text-primary border border-sidebar-border/70 shadow-2xs">
							<Sparkles className="w-4 h-4" />
						</div>
						<span>
							{confirmTarget?.title ??
								(confirmTarget?.isAll
									? "Install All Missing Dependencies"
									: `Install ${formatToolName(confirmTarget?.name ?? "")}?`)}
						</span>
					</AlertDialogTitle>
					<AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
						The following binary tools will be downloaded and extracted silently into managed application storage:
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="rounded-xl border border-sidebar-border bg-background/60 p-3 space-y-2.5">
					{confirmTarget?.toolsInfo?.map((tool) => (
						<div
							key={tool.name}
							className="w-full rounded-lg border border-sidebar-border/60 bg-sidebar/80 p-2.5 space-y-1.5 text-left text-xs text-foreground transition-colors hover:bg-sidebar"
						>
							<div className="flex items-center justify-between gap-2 text-foreground font-medium">
								<div className="flex items-center gap-2">
									<Package className="w-4 h-4 text-primary shrink-0" />
									<span>{formatToolName(tool.name)}</span>
								</div>
								<span className="rounded-full bg-primary/10 text-primary border border-primary/20 font-mono text-[11px] px-2.5 py-0.5 shrink-0 font-medium shadow-2xs">
									<SizeDisplay sizeMb={tool.sizeMb} />
								</span>
							</div>

							<div className="flex items-center gap-2 pl-6 font-mono text-[11px] text-muted-foreground flex-wrap">
								<span>
									{formatVersionDisplay(tool.currentVersion)}
								</span>
								<ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
								<span className="font-medium text-foreground">
									{formatVersionDisplay(tool.targetVersion)}
								</span>
							</div>
						</div>
					))}

					<div className="flex items-center justify-between gap-2 pt-2 px-1 border-t border-sidebar-border/60 font-medium text-foreground text-xs">
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-normal truncate">
							<ShieldCheck className="w-3.5 h-3.5 text-chart-1 shrink-0" />
							<span className="truncate">Verified SHA-256</span>
						</div>
						<div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
							<span className="text-muted-foreground font-normal">Total:</span>
							<span className="font-mono font-medium text-primary text-xs">
								<SizeDisplay sizeMb={confirmTarget?.sizeMb} />
							</span>
						</div>
					</div>
				</div>

				<AlertDialogFooter className="pt-4 -mb-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
					<AlertDialogCancel onClick={onClose}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 px-4 py-2 text-xs font-medium gap-1.5 shadow-xs"
					>
						<Download className="w-3.5 h-3.5" /> Download & Install
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
});

export interface DependencyUninstallDialogProps {
	targetTool: string | null;
	onClose: () => void;
	onConfirm: () => void;
}

export const DependencyUninstallDialog = React.memo(function DependencyUninstallDialog({
	targetTool,
	onClose,
	onConfirm,
}: DependencyUninstallDialogProps) {
	const toolName = targetTool ? formatToolName(targetTool) : "";
	const impactText = targetTool ? getToolDisabledImpact(targetTool) : "";

	return (
		<AlertDialog open={!!targetTool} onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent className="sm:max-w-lg bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
				<AlertDialogHeader className="space-y-1.5 text-left">
					<AlertDialogTitle className="flex items-center gap-2.5 text-foreground font-serif font-normal text-lg">
						<div className="p-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 shadow-2xs">
							<ShieldAlert className="w-4 h-4" />
						</div>
						<span>Uninstall {toolName}?</span>
					</AlertDialogTitle>
					<AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
						This action will permanently delete the managed <span className="font-medium text-foreground">{toolName}</span> binary files from your local application data folder.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1.5 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5 font-medium text-destructive">
						<Trash2 className="w-3.5 h-3.5 shrink-0" />
						<span>Feature Impact Warning</span>
					</div>
					<p className="leading-relaxed">{impactText}</p>
					<p className="text-[11px] opacity-80 pt-1 border-t border-destructive/10">
						You can reinstall {toolName} at any time with 1-click from the Dependency Manager.
					</p>
				</div>

				<AlertDialogFooter className="pt-4 -mb-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
					<AlertDialogCancel onClick={onClose}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95 px-4 py-2 text-xs font-medium gap-1.5 shadow-xs"
					>
						<Trash2 className="w-3.5 h-3.5" /> Uninstall Binary
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
});

// ── Clear WebKit Cache Confirmation Dialog ────────────────────────────────────
export interface ClearWebKitCacheDialogProps {
	open: boolean;
	cacheSizeMb: number | null;
	onClose: () => void;
	onConfirm: () => void;
}

export const ClearWebKitCacheDialog = React.memo(function ClearWebKitCacheDialog({
	open,
	cacheSizeMb,
	onClose,
	onConfirm,
}: ClearWebKitCacheDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<AlertDialogContent className="sm:max-w-lg bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
				<AlertDialogHeader className="space-y-1.5 text-left">
					<AlertDialogTitle className="flex items-center gap-2.5 text-foreground font-serif font-normal text-lg">
						<div className="p-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 shadow-2xs">
							<Trash2 className="w-4 h-4" />
						</div>
						<span>Clear WebView Cache?</span>
					</AlertDialogTitle>
					<AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
						This will permanently delete the application&apos;s WebView cache stored on disk (such as shader cache, network cache, and media cache). The app will rebuild it automatically as needed.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1.5 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5 font-medium text-destructive">
						<ShieldAlert className="w-3.5 h-3.5 shrink-0" />
						<span>Cache to be cleared</span>
					</div>
					<div className="flex items-center justify-between pt-0.5">
						<span>App WebView Cache</span>
						<span className="font-mono font-medium text-foreground">
							{cacheSizeMb !== null && cacheSizeMb > 0
								? formatSizeMb(cacheSizeMb)
								: "—"}
						</span>
					</div>
					<p className="text-[11px] opacity-80 pt-1 border-t border-destructive/10">
						The app may load slightly slower on first use after clearing, while assets are re-cached.
					</p>
				</div>

				<AlertDialogFooter className="pt-4 -mb-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
					<AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95 px-4 py-2 text-xs font-medium gap-1.5 shadow-xs"
					>
						<Trash2 className="w-3.5 h-3.5" /> Clear Cache
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
});

// ── Up To Date Alert Dialog ──────────────────────────────────────────────────
export interface ToolChecksumInfo {
	name: string;
	version: string;
	sha256: string;
	isValid?: boolean;
}

export interface UpToDateDialogProps {
	open: boolean;
	onClose: () => void;
	tools?: ToolChecksumInfo[];
}

export const UpToDateDialog = React.memo(function UpToDateDialog({
	open,
	onClose,
	tools = [],
}: UpToDateDialogProps) {
	const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

	const handleCopy = (name: string, sha256: string) => {
		navigator.clipboard.writeText(sha256);
		setCopiedKey(name);
		setTimeout(() => setCopiedKey(null), 2000);
	};

	return (
		<AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<AlertDialogContent className="sm:max-w-lg bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
				<AlertDialogHeader className="space-y-1.5 text-left">
					<AlertDialogTitle className="flex items-center gap-2.5 text-foreground font-serif font-normal text-lg">
						<div className="p-2 rounded-lg bg-chart-1/10 text-chart-1 border border-chart-1/20 shadow-2xs">
							<CheckCircle2 className="w-4 h-4" />
						</div>
						<span>Dependencies & SHA-256 Validated</span>
					</AlertDialogTitle>
					<AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
						All required binary tools (FFmpeg, FFprobe, and yt-dlp) are up to date and their local file SHA-256 checksums have been verified.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="rounded-xl border border-sidebar-border bg-background/60 p-3 space-y-2 text-xs text-muted-foreground">
					<div className="flex items-center justify-between gap-2 pb-1.5 border-b border-sidebar-border/60 font-medium text-foreground">
						<div className="flex items-center gap-1.5 text-chart-1">
							<ShieldCheck className="w-3.5 h-3.5" />
							<span>Verified SHA-256 Checksums</span>
						</div>
						<span className="text-[11px] text-muted-foreground font-mono font-normal">
							{tools.length} Tools Valid
						</span>
					</div>

					{tools.length > 0 ? (
						<div className="space-y-2 pt-0.5">
							{tools.map((t) => (
								<div
									key={t.name}
									className="rounded-lg border border-sidebar-border/60 bg-sidebar/80 p-2.5 space-y-1.5 text-left"
								>
									<div className="flex items-center justify-between gap-2 text-foreground font-medium">
										<div className="flex items-center gap-2">
											<Package className="w-4 h-4 text-primary shrink-0" />
											<span>{formatToolName(t.name)}</span>
										</div>
										<span className="rounded-full bg-chart-1/10 text-chart-1 border border-chart-1/30 text-[10px] px-2 py-0.5 font-mono font-medium flex items-center gap-1">
											<CheckCircle2 className="w-3 h-3" />
											Verified
										</span>
									</div>

									<div className="flex items-center justify-between gap-2 font-mono text-[11px]">
										<span className="text-muted-foreground">
											{formatVersionDisplay(t.version)}
										</span>
										<button
											type="button"
											onClick={() => handleCopy(t.name, t.sha256)}
											className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground bg-background/60 hover:bg-background border border-sidebar-border/60 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
											title="Click to copy SHA-256"
										>
											{copiedKey === t.name ? (
												<Check className="w-3 h-3 text-chart-1" />
											) : (
												<Copy className="w-3 h-3 text-primary/70" />
											)}
											<span>{t.sha256.slice(0, 8)}…{t.sha256.slice(-8)}</span>
										</button>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-xs text-foreground/80 leading-relaxed pt-1">
							Your installation is completely up to date. You can continue using all features.
						</p>
					)}
				</div>

				<AlertDialogFooter className="pt-4 -mb-2 border-t border-sidebar-border/60 flex items-center justify-end">
					<AlertDialogAction
						onClick={onClose}
						className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 px-5 py-2 text-xs font-medium gap-1.5 shadow-xs"
					>
						Done
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
});

// ── Change Path picker ──────────────────────────────────────────────────
// Lets the user pick which detected installation (env override, managed,
// system PATH) TheAtlas should actually use for a tool. The choice is
// persisted backend-side and always outranks auto-detection — including an
// active THEATLAS_*_PATH env override.

export interface DependencyPathDialogProps {
	/** Tool key ("ffmpeg" | "ffprobe" | "ytdlp") to pick a path for, or null when closed. */
	toolKey: string | null;
	/** The currently active resolved path (`DependencyInfo.path`), to mark the active candidate. */
	currentPath: string | null;
	onClose: () => void;
	/** Called after a successful change (including reset-to-automatic) so the caller can recheck. */
	onChanged: () => void;
	/** Optional callback to open the batch change dialog */
	onOpenBatch?: () => void;
}

export const DependencyPathDialog = React.memo(function DependencyPathDialog({
	toolKey,
	currentPath,
	onClose,
	onChanged,
	onOpenBatch,
}: DependencyPathDialogProps) {
	const [candidates, setCandidates] = React.useState<DependencyCandidate[]>(
		() => (toolKey ? getSyncCachedCandidates(toolKey) ?? [] : []),
	);
	const [loadedForKey, setLoadedForKey] = React.useState<string | null>(
		() => (toolKey && getSyncCachedCandidates(toolKey) ? toolKey : null),
	);
	const [pendingPath, setPendingPath] = React.useState<string | null>(null);
	const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const isBusy = pendingPath !== null;
	// Derived, not tracked state: "loading" just means the fetch for the
	// currently-open tool hasn't resolved (success or failure) yet.
	const isLoading = toolKey !== null && loadedForKey !== toolKey;

	// Reset local UI state whenever the dialog switches to a different tool
	// (or opens). Adjusted during render per React's "you might not need an
	// effect" guidance instead of inside the effect body below — this bails
	// out within the same render pass rather than causing an extra commit.
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

		// Try the module-level candidate cache first (populated by prefetchCandidates
		// after every refreshDependencies). Falls back to a fresh probe when empty.
		getCachedCandidates(toolKey)
			.then((result) => {
				if (!cancelled) setCandidates(result);
			})
			.catch((e) => {
				if (!cancelled) setError(String(e));
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
			setPendingPath(path ?? "__auto__");
			setError(null);
			try {
				await set_dependency_override(toolKey, path);
				// Drop cached candidates: path changed, re-probe on next open.
				dropCandidateCache();
				onChanged();
				onClose();
			} catch (e) {
				setError(String(e));
			} finally {
				setPendingPath(null);
			}
		},
		[toolKey, onChanged, onClose],
	);

	const handleRescan = React.useCallback(async () => {
		if (!toolKey || isBusy) return;
		setLoadedForKey(null);
		setError(null);
		try {
			const fresh = await get_dependency_candidates(toolKey, true);
			setCandidates(fresh);
		} catch (e) {
			setError(String(e));
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
								>
									<SlidersHorizontal className="w-3 h-3 text-primary" />
									<span>Batch Switch</span>
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
										isLoading && "animate-spin",
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
							{candidates.map((c) => {
								const isSelected = c.path === selectedPath;
								const isActive = selectedPath === null && c.path === currentPath;
								return (
									<button
										key={c.path}
										type="button"
										disabled={!c.working || isBusy}
										aria-pressed={isSelected}
										onClick={() => setSelectedPath(c.path === selectedPath ? null : c.path)}
										className={cn(
											"w-full text-left rounded-lg border p-2.5 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
											isSelected
												? "border-primary bg-primary/10 ring-1 ring-primary/40"
												: isActive
													? "border-primary/40 bg-primary/5"
													: "border-sidebar-border/60 bg-sidebar/80 hover:bg-sidebar",
										)}
									>
										<div className="flex items-center justify-between gap-2 font-medium text-foreground">
											<span className="flex items-center gap-1.5">
												{(isSelected || isActive) && (
													<CheckCircle2 className="w-3.5 h-3.5 text-chart-1 shrink-0" />
												)}
												{formatSourceLabel(c.source)}
											</span>
											{c.working ? (
												<span className="flex items-center gap-2 shrink-0">
													{c.version && (
														<span className="text-[11px] font-mono text-muted-foreground">
															{formatVersionDisplay(c.version)}
														</span>
													)}
													{c.sizeBytes != null && c.sizeBytes > 0 && (
														<span className="rounded-full bg-primary/10 text-primary border border-primary/20 font-mono text-[10px] px-2 py-0.5 font-medium">
															{formatSizeBytes(c.sizeBytes)}
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
											{c.path}
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
						{pendingPath === "__auto__" ? (
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
						{pendingPath !== null && pendingPath !== "__auto__" ? (
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

// ── Batch Change Dependency Paths Dialog ──────────────────────────────────────
const TOOL_KEYS = ["yt-dlp", "ffmpeg", "ffprobe"] as const;

export type BatchSourceMode = "auto" | "managed" | "path";

export interface DependencyBatchPathDialogProps {
	open: boolean;
	dependencies: DependencyReport | null;
	onClose: () => void;
	onChanged: () => void;
}

export const DependencyBatchPathDialog = React.memo(function DependencyBatchPathDialog({
	open,
	dependencies,
	onClose,
	onChanged,
}: DependencyBatchPathDialogProps) {
	const [candidatesMap, setCandidatesMap] = React.useState<Record<string, DependencyCandidate[]>>({});
	// Derive current mode from active dependencies
	const currentMode = React.useMemo((): BatchSourceMode => {
		if (!dependencies) return "auto";
		const sources = [
			dependencies.ytdlp?.source,
			dependencies.ffmpeg?.source,
			dependencies.ffprobe?.source,
		];
		if (sources.length > 0 && sources.every((s) => s === "managed")) {
			return "managed";
		}
		if (sources.length > 0 && sources.every((s) => s === "path")) {
			return "path";
		}
		return "auto";
	}, [dependencies]);

	const [selectedMode, setSelectedMode] = React.useState<BatchSourceMode>(() => currentMode);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isApplying, setIsApplying] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const [lastOpen, setLastOpen] = React.useState(open);
	if (open !== lastOpen) {
		setLastOpen(open);
		if (open) {
			setSelectedMode(currentMode);
			setError(null);
		}
	}

	const handleRescan = React.useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const [yt, ff, fp] = await Promise.all([
				get_dependency_candidates("yt-dlp", true),
				get_dependency_candidates("ffmpeg", true),
				get_dependency_candidates("ffprobe", true),
			]);
			setCandidatesMap({
				"yt-dlp": yt,
				ffmpeg: ff,
				ffprobe: fp,
			});
		} catch (err) {
			setError(String(err));
		} finally {
			setIsLoading(false);
		}
	}, []);

	React.useEffect(() => {
		if (!open) return;
		let cancelled = false;

		Promise.all([
			get_dependency_candidates("yt-dlp", false),
			get_dependency_candidates("ffmpeg", false),
			get_dependency_candidates("ffprobe", false),
		])
			.then(([yt, ff, fp]) => {
				if (!cancelled) {
					setCandidatesMap({
						"yt-dlp": yt,
						ffmpeg: ff,
						ffprobe: fp,
					});
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setError(String(err));
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [open]);

	// Compute available count for each source mode
	const managedCounts = React.useMemo(() => {
		let working = 0;
		for (const key of TOOL_KEYS) {
			const cand = candidatesMap[key]?.find((c) => c.source === "managed" && c.working);
			if (cand) working++;
		}
		return working;
	}, [candidatesMap]);

	const pathCounts = React.useMemo(() => {
		let working = 0;
		for (const key of TOOL_KEYS) {
			const cand = candidatesMap[key]?.find((c) => c.source === "path" && c.working);
			if (cand) working++;
		}
		return working;
	}, [candidatesMap]);

	// Build target overrides object based on selected mode
	const targetOverrides = React.useMemo<Record<string, string | null>>(() => {
		const overrides: Record<string, string | null> = {
			"yt-dlp": null,
			ffmpeg: null,
			ffprobe: null,
		};

		if (selectedMode === "auto") {
			return overrides;
		}

		if (selectedMode === "managed") {
			for (const key of TOOL_KEYS) {
				const cand = candidatesMap[key]?.find((c) => c.source === "managed" && c.working);
				if (cand) {
					overrides[key] = cand.path;
				}
			}
			return overrides;
		}

		if (selectedMode === "path") {
			for (const key of TOOL_KEYS) {
				const cand = candidatesMap[key]?.find((c) => c.source === "path" && c.working);
				if (cand) {
					overrides[key] = cand.path;
				}
			}
			return overrides;
		}

		return overrides;
	}, [candidatesMap, selectedMode]);

	const handleApply = React.useCallback(async () => {
		setIsApplying(true);
		setError(null);
		try {
			await set_all_dependency_overrides(targetOverrides);
			dropCandidateCache();
			onChanged();
			onClose();
		} catch (err) {
			setError(String(err));
		} finally {
			setIsApplying(false);
		}
	}, [targetOverrides, onChanged, onClose]);

	// Source strategies definitions
	const strategies = [
		{
			id: "auto" as BatchSourceMode,
			title: "Automatic Precedence",
			subtitle: "Restore default resolution order",
			description: "Environment Variables → Managed App Storage → System PATH.",
			icon: RotateCcw,
			badge: currentMode === "auto" ? "Current (Default)" : "Default",
			available: true,
			badgeVariant: "bg-primary/10 text-primary border-primary/20",
		},
		{
			id: "managed" as BatchSourceMode,
			title: "Official Managed Binaries",
			subtitle: "Application managed storage",
			description: "Switch all tools to isolated binaries managed & updatable by TheAtlas.",
			icon: HardDrive,
			badge: currentMode === "managed"
				? `Current (${managedCounts}/3 Active)`
				: `${managedCounts}/3 Available`,
			available: managedCounts > 0,
			badgeVariant: managedCounts === 3
				? "bg-chart-1/10 text-chart-1 border-chart-1/30"
				: "bg-muted text-muted-foreground border-border",
		},
		{
			id: "path" as BatchSourceMode,
			title: "System PATH Installations",
			subtitle: "System environment PATH",
			description: "Switch all tools to system-wide binary installations found in PATH.",
			icon: Terminal,
			badge: currentMode === "path"
				? `Current (${pathCounts}/3 Active)`
				: `${pathCounts}/3 Detected`,
			available: pathCounts > 0,
			badgeVariant: pathCounts === 3
				? "bg-chart-1/10 text-chart-1 border-chart-1/30"
				: "bg-muted text-muted-foreground border-border",
		},
	];

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isApplying && onClose()}>
			<DialogContent className="sm:max-w-2xl bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
				<DialogHeader className="space-y-1.5 text-left pr-6">
					<DialogTitle className="flex items-center gap-2.5 text-foreground font-serif font-normal text-lg">
						<div className="p-2 rounded-lg bg-secondary text-primary border border-sidebar-border/70 shadow-2xs">
							<SlidersHorizontal className="w-4 h-4" />
						</div>
						<span>Batch Switch Dependency Paths</span>
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground leading-relaxed">
						Recursively switch active binary sources across all dependencies (FFmpeg, FFprobe, and yt-dlp) in one click.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
					<div className="flex items-center justify-between gap-2 pt-0.5">
						<span className="text-xs font-medium text-foreground">
							Select Source Strategy
						</span>
						<Button
							type="button"
							size="xs"
							variant="ghost"
							disabled={isLoading || isApplying}
							onClick={handleRescan}
							className="gap-1 text-xs text-muted-foreground hover:text-foreground h-6 px-2 group/rescan cursor-pointer rounded-md"
							title="Re-scan all installations on the system"
						>
							<RefreshCw
								className={cn(
									"w-3 h-3 transition-transform duration-500 ease-in-out group-hover/rescan:rotate-180",
									isLoading && "animate-spin",
								)}
							/>
							<span>Rescan System</span>
						</Button>
					</div>

					{/* Strategy Selection List */}
					<div className="space-y-2">
						{strategies.map((strat) => {
							const isSelected = selectedMode === strat.id;
							const Icon = strat.icon;
							return (
								<button
									key={strat.id}
									type="button"
									disabled={!strat.available || isApplying}
									onClick={() => setSelectedMode(strat.id)}
									className={cn(
										"w-full flex items-center justify-between gap-3 rounded-xl border p-3 text-left text-xs transition-colors cursor-pointer",
										isSelected
											? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs"
											: "border-sidebar-border/60 bg-sidebar/80 hover:bg-sidebar",
										!strat.available && "opacity-50 cursor-not-allowed",
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
											<Icon className="w-4 h-4" />
										</div>
										<div className="space-y-0.5 min-w-0">
											<div className="flex items-center gap-2 font-medium text-foreground">
												<span>{strat.title}</span>
												{isSelected && (
													<CheckCircle2 className="w-3.5 h-3.5 text-chart-1 shrink-0" />
												)}
											</div>
											<p className="text-[11px] text-muted-foreground leading-relaxed">
												{strat.description}
											</p>
										</div>
									</div>
									<span
										className={cn(
											"shrink-0 rounded-full border text-[10px] font-mono px-2.5 py-0.5 font-medium shadow-2xs whitespace-nowrap",
											strat.badgeVariant,
										)}
									>
										{strat.badge}
									</span>
								</button>
							);
						})}
					</div>

					{/* Live Per-Tool Impact Preview */}
					<div className="rounded-xl border border-sidebar-border bg-background/60 p-3 space-y-2.5">
						<div className="flex items-center justify-between gap-2 pb-1.5 border-b border-sidebar-border/60 text-xs font-medium text-foreground">
							<div className="flex items-center gap-1.5">
								<Layers className="w-3.5 h-3.5 text-primary" />
								<span>Preview of Applied Changes</span>
							</div>
							<span className="text-[11px] text-muted-foreground font-mono font-normal">
								3 Dependencies
							</span>
						</div>

						{isLoading ? (
							<div className="flex items-center justify-center gap-2 py-5 text-xs text-muted-foreground">
								<Loader2 className="w-4 h-4 animate-spin text-primary" />
								<span>Querying system candidate paths…</span>
							</div>
						) : (
							<div className="space-y-2 pt-0.5">
								{TOOL_KEYS.map((toolKey) => {
									const currentInfo = dependencies?.[toolKey === "yt-dlp" ? "ytdlp" : toolKey];
									const candidates = candidatesMap[toolKey] ?? [];
									const targetPath = targetOverrides[toolKey];

									const matchingCandidate = targetPath
										? candidates.find((c) => c.path === targetPath)
										: null;

									const isTargetMissing = selectedMode !== "auto" && !targetPath;

									return (
										<div
											key={toolKey}
											className="w-full rounded-xl border border-sidebar-border/60 bg-sidebar/80 p-3 space-y-2 text-left text-xs text-foreground transition-colors hover:bg-sidebar"
										>
											<div className="flex items-center justify-between gap-2 font-medium">
												<div className="flex items-center gap-2">
													<Package className="w-4 h-4 text-primary shrink-0" />
													<span className="font-medium text-sm text-foreground">{formatToolName(toolKey)}</span>
												</div>
												{isTargetMissing ? (
													<span className="rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[10px] px-2 py-0.5 font-mono">
														Not Found in {selectedMode === "managed" ? "Managed" : "PATH"}
													</span>
												) : selectedMode === "auto" ? (
													<span className="rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] px-2.5 py-0.5 font-mono font-medium">
														Automatic Precedence
													</span>
												) : (
													<span className="rounded-full bg-chart-1/10 text-chart-1 border border-chart-1/30 text-[10px] px-2.5 py-0.5 font-mono font-medium flex items-center gap-1">
														<CheckCircle2 className="w-3 h-3" />
														{matchingCandidate ? formatSourceLabel(matchingCandidate.source) : "Custom"}
													</span>
												)}
											</div>

											<div className="flex items-center gap-2 pl-6 font-mono text-[11px]">
												<span
													className="bg-background/60 px-2 py-0.5 rounded-md border border-sidebar-border/50 text-muted-foreground truncate max-w-[220px]"
													title={currentInfo?.path ?? "Automatic"}
												>
													{currentInfo?.source ? formatSourceLabel(currentInfo.source) : "Automatic"}
													{currentInfo?.version ? ` (${formatVersionDisplay(currentInfo.version)})` : ""}
												</span>
												<ArrowRight className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
												<span
													className={cn(
														"px-2 py-0.5 rounded-md border font-medium truncate max-w-[260px]",
														isTargetMissing
															? "bg-destructive/10 border-destructive/20 text-destructive"
															: "bg-primary/10 border-primary/20 text-foreground",
													)}
													title={targetPath ?? "Automatic Resolution"}
												>
													{selectedMode === "auto"
														? "Automatic Resolution"
														: matchingCandidate
															? `${formatSourceLabel(matchingCandidate.source)}${matchingCandidate.version ? ` (${formatVersionDisplay(matchingCandidate.version)})` : ""}`
															: "Unchanged (Not Available)"}
												</span>
											</div>
										</div>
									);
								})}
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
						onClick={handleApply}
						className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-xs font-medium gap-1.5 shadow-xs"
					>
						{isApplying ? (
							<>
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
								Applying…
							</>
						) : (
							<>
								<Check className="w-3.5 h-3.5" />
								Apply to All Dependencies
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});

