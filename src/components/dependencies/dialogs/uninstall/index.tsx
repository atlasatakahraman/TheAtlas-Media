"use client";

import React from "react";
import { ShieldAlert, Trash2 } from "lucide-react";
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
import { formatToolName, getToolDisabledImpact } from "@/lib/tool-names";
import type { DependencyUninstallDialogProps } from "./types";

const DependencyUninstallDialog = React.memo(function DependencyUninstallDialog({
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
						This action will permanently delete the managed{" "}
						<span className="font-medium text-foreground">{toolName}</span> binary files
						from your local application data folder.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1.5 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5 font-medium text-destructive">
						<Trash2 className="w-3.5 h-3.5 shrink-0" />
						<span>Feature Impact Warning</span>
					</div>
					<p className="leading-relaxed">{impactText}</p>
					<p className="text-[11px] opacity-80 pt-1 border-t border-destructive/10">
						You can reinstall {toolName} at any time with 1-click from the Dependency
						Manager.
					</p>
				</div>

				<AlertDialogFooter className="pt-4 -mb-2 border-t border-sidebar-border/60 flex items-center justify-end gap-2.5">
					<AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
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

export default DependencyUninstallDialog;
