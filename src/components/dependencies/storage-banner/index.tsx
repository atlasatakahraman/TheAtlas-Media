"use client";

import { CheckCircle2, FolderOpen, HardDrive, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSizeMb } from "@/lib/utils";
import { TOOLS } from "@/registry/tools";
import { computeStorageLabel, countInstalled, hasAnyTwoPaths } from "./functions";
import type { StorageBannerProps } from "./types";

/** At-a-glance health: how many tools are present, and where they live. */
export default function StorageBanner({
	report,
	missingCount,
	appStorageMb,
	isOpeningStorageDir,
	onOpenStorageDir,
}: StorageBannerProps) {
	const installedCount = countInstalled(report);
	const storageLabel = computeStorageLabel(report);

	// "Cache" only when nothing of ours is on disk anywhere — a shadowed managed
	// copy still occupies managed storage even though a system path is winning.
	const isCacheOnly = storageLabel === "System Path Storage" && !hasAnyTwoPaths(report);

	return (
		<div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl border border-sidebar-border bg-sidebar/50 text-xs">
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-1.5 font-normal text-foreground">
					<CheckCircle2 className="w-4 h-4 text-chart-1 shrink-0" />
					<span>
						Installed:{" "}
						<span className="font-medium">
							{installedCount}/{TOOLS.length}
						</span>
					</span>
				</div>

				{missingCount > 0 && (
					<div className="flex items-center gap-1.5 font-normal text-destructive">
						<ShieldAlert className="w-4 h-4 shrink-0" />
						<span>
							Missing: <span className="font-medium">{missingCount}</span>
						</span>
					</div>
				)}

				<div className="flex items-center gap-1.5 font-normal text-foreground">
					<HardDrive className="w-4 h-4 text-primary shrink-0" />
					<span className="shrink-0">{isCacheOnly ? "Used Cache:" : "Used Storage:"}</span>
					<span className="font-mono text-primary font-medium">
						{formatSizeMb(appStorageMb)}
					</span>
					<Button
						variant="ghost"
						size="xs"
						disabled={isOpeningStorageDir}
						onClick={onOpenStorageDir}
						className="h-auto gap-1 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground rounded-md"
					>
						{isOpeningStorageDir ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<FolderOpen className="w-3 h-3" />
						)}
						Open Folder
					</Button>
				</div>
			</div>

			<div className="flex items-center gap-2 text-muted-foreground text-[11px] shrink-0">
				<span>{storageLabel}</span>
				<span className="opacity-40">•</span>
				<div className="flex items-center justify-center gap-1">
					<ShieldCheck className="w-4 h-4 text-chart-1" />
					<span className="text-chart-1">Verified SHA-256 Checksums</span>
				</div>
			</div>
		</div>
	);
}
