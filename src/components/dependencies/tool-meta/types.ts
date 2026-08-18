import type { DependencyInfo } from "@/lib/types";
import type { ToolSpec } from "@/registry/tools";

export type ToolMetaProps = {
	tool: ToolSpec;
	info: DependencyInfo | undefined;
	/** Gates the dynamic rows; the static ones always render. */
	isInstalled: boolean;
	isRevealingPath: boolean;
	onRevealPath: (path: string) => void;
	onChangePathClick: (key: string) => void;
};
