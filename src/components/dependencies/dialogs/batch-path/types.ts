import type { LucideIcon } from "lucide-react";
import type { DependencyCandidate, DependencyReport, DependencySource } from "@/lib/types";

/**
 * Which source every tool should be pointed at.
 *
 * `"auto"` clears the overrides and restores the backend's own precedence
 * (env → managed → PATH); the other two pin every tool that has a working
 * candidate of that source.
 */
export type BatchSourceMode = "auto" | "managed" | "path";

export type DependencyBatchPathDialogProps = {
	open: boolean;
	/** Null while the first report is still loading. */
	dependencies: DependencyReport | null;
	onClose: () => void;
	/** Fired after a successful apply so the caller can refresh. */
	onChanged: () => void;
};

/** Candidates for every tool, keyed by the registry's canonical tool key. */
export type CandidatesByTool = Record<string, DependencyCandidate[]>;

/** One selectable strategy, as rendered in the dialog. */
export type StrategyOption = {
	id: BatchSourceMode;
	title: string;
	description: string;
	/**
	 * The component, not an element. Rendered through `createElement` — a
	 * `const Icon = option.icon; <Icon/>` lookup is what the React Compiler's
	 * "cannot create components during render" rule refuses.
	 */
	icon: LucideIcon;
	/** Right-hand pill: how many tools this mode can actually move. */
	badge: string;
	/** False when no tool has a working candidate of this source. */
	available: boolean;
	isCurrent: boolean;
};

/** One row of the "what will change" preview. */
export type ImpactRow = {
	toolKey: string;
	name: string;
	fromLabel: string;
	toLabel: string;
	/** The mode is pinned but this tool has no candidate for it. */
	missing: boolean;
	targetSource: DependencySource | null;
};
