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
import { formatSizeMb } from "@/lib/utils";
import type { ClearWebKitCacheDialogProps } from "./types";

const ClearWebKitCacheDialog = React.memo(function ClearWebKitCacheDialog({
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
						This will permanently delete the application&apos;s WebView cache stored on
						disk (such as shader cache, network cache, and media cache). The app will
						rebuild it automatically as needed.
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
							{cacheSizeMb !== null && cacheSizeMb > 0 ? formatSizeMb(cacheSizeMb) : "—"}
						</span>
					</div>
					<p className="text-[11px] opacity-80 pt-1 border-t border-destructive/10">
						The app may load slightly slower on first use after clearing, while assets are
						re-cached.
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

export default ClearWebKitCacheDialog;
