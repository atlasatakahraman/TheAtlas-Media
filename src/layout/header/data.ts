import DependencyBadge from "@/components/header/dependency-badge";
import PageTitle from "@/components/header/page-title";
import SidebarToggle from "@/components/header/sidebar-toggle";
import ThemeToggleSlot from "@/components/header/theme-toggle-slot";
import WindowControls from "@/components/header/window-controls";
import type { HeaderSlot } from "./types";

/**
 * Everything the header renders, as data.
 *
 * Adding a widget is one entry here — `Header.tsx` never changes. `order` is
 * ascending within an area; leave gaps of 10 so an insertion doesn't require
 * renumbering its neighbours.
 */
export const HEADER_SLOTS: readonly HeaderSlot[] = [
	{
		id: "sidebar-toggle",
		area: "left",
		order: 10,
		Component: SidebarToggle,
	},
	{
		id: "theme-toggle",
		area: "left",
		order: 20,
		Component: ThemeToggleSlot,
	},
	{
		id: "dependency-badge",
		area: "left",
		order: 30,
		Component: DependencyBadge,
	},
	{
		id: "page-title",
		area: "center",
		order: 10,
		// The root page is titled by its own hero content; repeating "Home" in
		// the chrome is noise.
		when: (ctx) => ctx.pathname !== "/" && ctx.title.length > 0,
		Component: PageTitle,
	},
	{
		id: "window-controls",
		area: "right",
		order: 10,
		Component: WindowControls,
	},
];
