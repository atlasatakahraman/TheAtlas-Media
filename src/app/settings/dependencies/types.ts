import type { ToolChecksumInfo } from "@/components/dependencies/dialogs/up-to-date/types";
import type { ToolInstallInfo } from "@/hooks/use-install";
import type { DependencyInfo } from "@/lib/types";

/** The dependency report indexed by every tool alias. */
export type DepMap = Record<string, DependencyInfo | undefined>;

/** Which tools an install dialog should list. See `buildToolInstallInfos`. */
export type ToolInfoMode = "missing" | "unmanaged" | "all-managed";

/** Outcome of a "Check Tools" pass. See `collectUpdateCheck`. */
export type UpdateCheckResult = {
	toolsToUpdate: ToolInstallInfo[];
	verifiedTools: ToolChecksumInfo[];
};
