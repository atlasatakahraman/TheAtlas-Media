"use client";

import React from "react";
import { Check, CheckCircle2, Copy, Package, ShieldCheck } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatToolName } from "@/lib/tool-names";
import { formatVersionDisplay } from "@/lib/version";
import type { UpToDateDialogProps } from "./types";

const UpToDateDialog = React.memo(function UpToDateDialog({
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
						<span>Dependencies &amp; SHA-256 Validated</span>
					</AlertDialogTitle>
					<AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
						All required binary tools (FFmpeg, FFprobe, and yt-dlp) are up to date and
						their local file SHA-256 checksums have been verified.
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
							{tools.map((tool) => (
								<div
									key={tool.name}
									className="rounded-lg border border-sidebar-border/60 bg-sidebar/80 p-2.5 space-y-1.5 text-left"
								>
									<div className="flex items-center justify-between gap-2 text-foreground font-medium">
										<div className="flex items-center gap-2">
											<Package className="w-4 h-4 text-primary shrink-0" />
											<span>{formatToolName(tool.name)}</span>
										</div>
										<span className="rounded-full bg-chart-1/10 text-chart-1 border border-chart-1/30 text-[10px] px-2 py-0.5 font-mono font-medium flex items-center gap-1">
											<CheckCircle2 className="w-3 h-3" />
											Verified
										</span>
									</div>

									<div className="flex items-center justify-between gap-2 font-mono text-[11px]">
										<span className="text-muted-foreground">
											{formatVersionDisplay(tool.version)}
										</span>
										<button
											type="button"
											onClick={() => handleCopy(tool.name, tool.sha256)}
											className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground bg-background/60 hover:bg-background border border-sidebar-border/60 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
											title="Click to copy SHA-256"
										>
											{copiedKey === tool.name ? (
												<Check className="w-3 h-3 text-chart-1" />
											) : (
												<Copy className="w-3 h-3 text-primary/70" />
											)}
											<span>
												{tool.sha256.slice(0, 8)}…{tool.sha256.slice(-8)}
											</span>
										</button>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-xs text-foreground/80 leading-relaxed pt-1">
							Your installation is completely up to date. You can continue using all
							features.
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

export default UpToDateDialog;
