import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type MetaRowProps = {
	icon: LucideIcon;
	label: string;
	children: ReactNode;
	/** Tints the whole row to signal a verified value (e.g. a matched checksum). */
	verified?: boolean;
};
