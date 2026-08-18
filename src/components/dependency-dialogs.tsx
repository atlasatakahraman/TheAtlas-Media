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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ConfirmTarget } from "@/hooks/use-install";
import { set_dependency_override } from "@/lib/dependency-env";
import { getCachedCandidates, getSyncCachedCandidates, dropCandidateCache } from "@/hooks/use-dependency";
import { formatSourceLabel, formatToolName, getToolDisabledImpact } from "@/lib/tool-names";
import type { DependencyCandidate } from "@/lib/types";
import { cn, formatSizeMb, formatSizeBytes } from "@/lib/utils";
import { formatVersionDisplay } from "@/lib/version";
import {
	AlertTriangle,
	ArrowRight,
	Check,
	CheckCircle2,
	Copy,
	Download,
	Loader2,
	Package,
	RotateCcw,
	Route,
	ShieldAlert,
	ShieldCheck,
	Sparkles,
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
			<AlertDialogContent className="sm:max-w-md bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
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
							className="flex w-full items-center justify-between gap-2.5 rounded-lg border border-sidebar-border/60 bg-sidebar/80 p-2.5 text-left text-xs text-foreground transition-colors hover:bg-sidebar"
						>
							<div className="space-y-0.5 text-left">
								<div className="flex items-center gap-2 font-medium">
									<Package className="w-4 h-4 text-primary shrink-0" />
									<span>{formatToolName(tool.name)}</span>
								</div>
								<div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pl-6 font-mono">
									<span>{formatVersionDisplay(tool.currentVersion)}</span>
									<ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
									<span className="font-medium text-foreground">
										{formatVersionDisplay(tool.targetVersion)}
									</span>
								</div>
							</div>
							<span className="rounded-full bg-primary/10 text-primary border border-primary/20 font-mono text-[11px] px-2.5 py-0.5 shrink-0 font-medium shadow-2xs">
								<SizeDisplay sizeMb={tool.sizeMb} />
							</span>
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

				<AlertDialogFooter className="pt-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
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
			<AlertDialogContent className="sm:max-w-md bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
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

				<AlertDialogFooter className="pt-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
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
			<AlertDialogContent className="sm:max-w-md bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
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

				<AlertDialogFooter className="pt-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
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
			<AlertDialogContent className="sm:max-w-md bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
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

				<AlertDialogFooter className="pt-2 border-t border-sidebar-border/60 flex items-center justify-end">
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
}

export const DependencyPathDialog = React.memo(function DependencyPathDialog({
	toolKey,
	currentPath,
	onClose,
	onChanged,
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

	return (
		<Dialog open={!!toolKey} onOpenChange={(open) => !open && !isBusy && onClose()}>
			<DialogContent className="sm:max-w-lg bg-sidebar border border-sidebar-border text-foreground shadow-2xl rounded-2xl p-6 space-y-4">
				<DialogHeader className="space-y-1.5 text-left">
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

