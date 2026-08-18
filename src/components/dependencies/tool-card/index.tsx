"use client";

import React from "react";
import { CheckCircle2, Info, Loader2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import InstallProgressPanel, { InstallFailureNotice } from "../install-progress";
import ToolActions from "../tool-actions";
import ToolMeta from "../tool-meta";
import { resolveToolCardState } from "./functions";
import type { ToolCardProps } from "./types";

/**
 * One managed binary: identity, status, the action that makes sense right now,
 * live install progress, and the resolved facts about the copy in use.
 */
const ToolCard = React.memo(function ToolCard({
	tool,
	info,
	installState,
	mounted,
	isLoading,
	isUninstalling = false,
	isRevealingPath = false,
	onInstallClick,
	onUninstallClick,
	onInstallManagedClick,
	onRevealPath,
	onChangePathClick,
}: ToolCardProps) {
	const state = resolveToolCardState({ info, installState, mounted, isLoading, isUninstalling });
	const { isInstalling, isInstalled, isExternal, isShadowingManaged } = state;

	const Icon = tool.icon;
	const iconElement = tool.logo ? (
		// eslint-disable-next-line @next/next/no-img-element -- images are globally unoptimized; next/image is disallowed project-wide
		<img
			src={tool.logo.src}
			alt={`${tool.name} logo`}
			width={20}
			height={20}
			className="w-5 h-5 object-contain"
		/>
	) : Icon ? (
		<Icon className="w-5 h-5 text-primary" />
	) : null;

	return (
		<Card
			className={cn(
				"bg-sidebar border-sidebar-border shadow-xs transition-colors py-0 rounded-2xl",
				!isInstalled && "border-chart-5 border-2"
			)}
		>
			<CardContent className="p-5 space-y-4">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="p-2.5 rounded-xl bg-secondary text-foreground border border-sidebar-border shrink-0">
							{iconElement}
						</div>
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<h3 className="font-serif font-normal text-foreground text-lg">
									{tool.name}
								</h3>
								{!mounted || isLoading ? (
									<Badge variant="outline" className="text-xs rounded-full">
										<Loader2 className="w-3 h-3 animate-spin mr-1" /> Loading
									</Badge>
								) : isUninstalling ? (
									<Badge variant="outline" className="text-xs rounded-full">
										<Loader2 className="w-3 h-3 animate-spin mr-1" /> Uninstalling…
									</Badge>
								) : isInstalled ? (
									<Badge
										variant="outline"
										className="bg-chart-1/10 text-chart-1 border-chart-1/30 text-xs gap-1 rounded-full font-medium"
									>
										<CheckCircle2 className="w-3.5 h-3.5" /> Installed
									</Badge>
								) : (
									<Badge
										variant="destructive"
										className="text-xs gap-1 rounded-full font-medium"
									>
										<ShieldAlert className="w-3.5 h-3.5" /> Missing
									</Badge>
								)}
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								{tool.description}
							</p>
							<div className="flex flex-wrap items-center gap-1.5 pt-1">
								{tool.features.map((feature) => (
									<span
										key={feature}
										className="rounded-full border border-sidebar-border bg-background/50 px-2.5 py-0.5 text-[11px] text-muted-foreground font-medium"
									>
										{feature}
									</span>
								))}
							</div>
						</div>
					</div>

					<ToolActions
						toolKey={tool.key}
						state={state}
						mounted={mounted}
						isUninstalling={isUninstalling}
						onInstallClick={onInstallClick}
						onUninstallClick={onUninstallClick}
						onInstallManagedClick={onInstallManagedClick}
						onChangePathClick={onChangePathClick}
					/>
				</div>

				{/* Never shown for managed or missing tools — there is nothing to
				    warn about when TheAtlas owns the binary. */}
				{isExternal && (
					<div className="rounded-xl border border-sidebar-border/60 bg-sidebar/60 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
						<Info className="w-4 h-4 shrink-0 mt-0.5 text-primary/70" />
						<p>
							{isShadowingManaged ? (
								<>
									A <code className="font-mono text-[11px]">THEATLAS_*_PATH</code>{" "}
									override is active, shadowing the managed copy at{" "}
									<span className="font-mono text-[11px] break-all">
										{info?.managedPath}
									</span>
									.
								</>
							) : (
								<>
									Using your own installation — TheAtlas will not update it. Install
									a managed copy to get automatic update checks.
								</>
							)}
						</p>
					</div>
				)}

				{isInstalling && installState && <InstallProgressPanel state={installState} />}

				{installState?.status === "failed" && !isInstalling && (
					<InstallFailureNotice message={installState.message} />
				)}

				<Separator className="bg-sidebar-border/60" />

				<ToolMeta
					tool={tool}
					info={info}
					isInstalled={isInstalled}
					isRevealingPath={isRevealingPath}
					onRevealPath={onRevealPath}
					onChangePathClick={onChangePathClick}
				/>
			</CardContent>
		</Card>
	);
});

export default ToolCard;
