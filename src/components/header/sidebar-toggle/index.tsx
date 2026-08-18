"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";

/** Sidebar toggle, shown only on narrow viewports where the rail is hidden. */
export default function SidebarToggle() {
	return (
		<div className="md:hidden">
			<SidebarTrigger />
		</div>
	);
}
