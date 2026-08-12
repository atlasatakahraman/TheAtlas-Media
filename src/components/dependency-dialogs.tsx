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
import type { ConfirmTarget } from "@/hooks/use-install";
import { formatToolName, getToolDisabledImpact } from "@/lib/tool-names";
import { formatSizeMb } from "@/lib/utils";
import { ArrowRight, Check, CheckCircle2, Copy, Download, Package, ShieldAlert, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
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

function formatVersionDisplay(version: string | null | undefined): string {
	if (!version || version === "Not Installed") return "Not Installed";
	const lower = version.trim().toLowerCase();
	if (lower === "latest release" || lower === "latest" || lower === "vlatest") {
		return "Latest Release";
	}

	let v = version.trim();
	const match =
		v.match(/(?:ffmpeg|ffprobe|yt-dlp)?\s*version\s+([^\s]+)/i) ||
		v.match(/^(?:ffmpeg|ffprobe|yt-dlp)\s+([^\s]+)/i);
	if (match && match[1]) {
		v = match[1];
	}

	if (v.startsWith("v") || v.startsWith("V")) return v;
	if (v.startsWith("n")) return `v${v.slice(1)}`;
	return `v${v}`;
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
						<span>Clear WebKit Cache?</span>
					</AlertDialogTitle>
					<AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
						This will permanently delete the application&apos;s WebKit cache stored on disk. The app will rebuild it automatically on next use.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1.5 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5 font-medium text-destructive">
						<ShieldAlert className="w-3.5 h-3.5 shrink-0" />
						<span>Cache to be cleared</span>
					</div>
					<div className="flex items-center justify-between pt-0.5">
						<span>WebKit App Cache</span>
						<span className="font-mono font-medium text-foreground">
							{cacheSizeMb !== null && cacheSizeMb > 0
								? `~${cacheSizeMb.toFixed(1)} MB`
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

