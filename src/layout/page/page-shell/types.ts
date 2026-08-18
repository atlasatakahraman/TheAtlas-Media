import type { ReactNode } from "react";
import type { IconName } from "@/registry/icons";

export type PageShellProps = {
	/** Heading. Usually the same string the nav registry uses for this route. */
	title: string;
	/** One sentence under the title explaining what the page is for. */
	description?: string;
	/** Registry icon name, rendered next to the title. */
	icon?: IconName;
	/**
	 * Buttons for the header row — the page's own toolbar.
	 *
	 * A slot rather than a prop list: every page's actions are different, and
	 * the shell has no business knowing what any of them do.
	 */
	actions?: ReactNode;
	/** Extra classes on the outer padded container. */
	className?: string;
	children?: ReactNode;
};
