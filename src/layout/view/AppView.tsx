// next@16.2.6 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-05-31
'use client';

import { Toaster } from "@/components/ui/sonner";
import { ViewProps } from "./types";
import Header from "../header/Header";
import { Sidebar, SidebarContent, SidebarHeader, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { openUrl } from "@tauri-apps/plugin-opener";
import Appbar from "../Appbar";
import { useEffect, useRef } from "react";

export default function AppView({ children }: ViewProps) {

	return (
		<div className="flex">
			<SidebarProvider className="w-fit" defaultOpen={true}>
				<Appbar></Appbar>
			</SidebarProvider>
			<div className="flex-1 flex flex-col h-screen">
				<div>
					<Header></Header>
				</div>
				<div className="flex-1 px-2 py-1 overflow-auto">
					{children}
				</div>
			</div>

			<Toaster position="top-right" swipeDirections={["right", "top"]} richColors></Toaster>
		</div>
	)
}
