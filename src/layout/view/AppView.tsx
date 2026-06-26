// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-06-21
'use client';

import { Toaster } from "@/components/ui/sonner";
import { ViewProps } from "./types";
import Header from "../header/Header";
import { SidebarProvider } from "@/components/ui/sidebar";
import Appbar from "../sidebar/Appbar";
import { useEffect, useRef, useState } from "react";
import { Logging } from "@/lib/utils";
import { usePathname } from "next/navigation";

export default function AppView({ children }: ViewProps) {

	const [sidebarSearch, setSidebarSearch] = useState<HTMLElement | null>(null);

	const mountRef = useRef(false);

	const pathname = usePathname();

	function handleSidebarSearchFocus(e: KeyboardEvent, input: HTMLElement, shouldPrevent: boolean = true): boolean {
		if (!input) {
			Logging.error("Could not find", input);
			return false;
		}
		if (shouldPrevent) e.preventDefault();

		if (document.activeElement === input) {
			input.blur();
		} else {
			input.focus()
		}

		return true;
	}

	useEffect(() => {
		if (mountRef.current) return;
		mountRef.current = true;
		setSidebarSearch(document.getElementById("sidebar-search"))
	}, [])

	useEffect(() => {
		if (sidebarSearch === null || !(sidebarSearch instanceof HTMLInputElement)) return;

		const handleKeyDown = (event: KeyboardEvent) => {

			if (event.key === "Escape") {
				const current = document.activeElement instanceof HTMLInputElement ? document.activeElement as HTMLInputElement : null;
				current?.blur();
				return;
			}

			if (
				event.key === "f" &&
				(event.metaKey || event.ctrlKey)
			) {
				handleSidebarSearchFocus(event, sidebarSearch)
				return;
			}

			if (document.activeElement !== document.body || (event.metaKey || (event.ctrlKey && !(event.ctrlKey && event.key === "a")) || event.altKey || event.shiftKey || event.key === ' ' || event.key === 'Enter' || event.key === 'Escape')) {
				return;
			};

			sidebarSearch.setSelectionRange(sidebarSearch.selectionStart || sidebarSearch.value.length, sidebarSearch.selectionStart || sidebarSearch.value.length);



			handleSidebarSearchFocus(event, sidebarSearch, false);

		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [sidebarSearch])

	return (
		<SidebarProvider defaultOpen={true}>
			<div className="flex">
				<Appbar ></Appbar>
				<div className="flex-1 flex flex-col h-screen">
					<div>
						<Header></Header>
					</div>
					<div key={pathname} className="flex-1 overflow-auto">
						{children}
					</div>
				</div>
				<Toaster position="top-right" swipeDirections={["right", "top"]} richColors></Toaster>
			</div>
		</SidebarProvider>

	)
}
