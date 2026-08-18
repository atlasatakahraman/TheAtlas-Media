"use client";

import React from "react";
import { ArrowRight, Download, Package, ShieldCheck, Sparkles } from "lucide-react";
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
import { formatToolName } from "@/lib/tool-names";
import { formatSizeMb } from "@/lib/utils";
import { formatVersionDisplay } from "@/lib/version";
import type { DependencyInstallDialogProps } from "./types";

/**
 * Placeholder for a size that is still being looked up.
 *
 * The dialog opens on the same frame as the click and fills sizes in as they
 * land, so this is the normal first paint rather than an error state.
 */
function SizeDisplay({ sizeMb }: { sizeMb: number | undefined }) {
	if (sizeMb === undefined || sizeMb <= 0) {
		return <span className="inline-block w-12 h-3.5 rounded-full bg-primary/10 animate-pulse" />;
	}
	return <>{formatSizeMb(sizeMb)}</>;
}

const DependencyInstallDialog = React.memo(function DependencyInstallDialog({
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
						The following binary tools will be downloaded and extracted silently into
						managed application storage:
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
								<span>{formatVersionDisplay(tool.currentVersion)}</span>
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
					<AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 px-4 py-2 text-xs font-medium gap-1.5 shadow-xs"
					>
						<Download className="w-3.5 h-3.5" /> Download &amp; Install
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
});

export default DependencyInstallDialog;
