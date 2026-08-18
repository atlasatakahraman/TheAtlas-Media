"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { toast } from "sonner";

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const mounted = useIsMounted();

	const isDark = resolvedTheme === "dark";

	const toggleTheme = () => {
		const nextTheme = isDark ? "light" : "dark";
		setTheme(nextTheme);
		toast.info(nextTheme === "dark" ? "Dark mode enabled" : "Light mode enabled", {
			description: nextTheme === "dark" ? "Switched to dark theme" : "Switched to light theme",
			duration: 2000,
		});
	};

	return (
		<button
			type="button"
			aria-label="Toggle dark and light mode"
			title={mounted ? (isDark ? "Switch to Light Mode" : "Switch to Dark Mode") : "Toggle theme"}
			onClick={toggleTheme}
			className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-sidebar-accent/80 active:bg-sidebar-accent border border-sidebar-border/50 text-foreground transition-transform transition-opacity duration-200 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0 select-none group"
		>
			{!mounted ? (
				<Sun className="w-3.5 h-3.5 opacity-60" />
			) : isDark ? (
				<Moon className="w-3.5 h-3.5 text-foreground transition-transform duration-300 ease-out group-hover:rotate-45 group-hover:scale-115" />
			) : (
				<Sun className="w-3.5 h-3.5 text-foreground transition-transform duration-300 ease-out group-hover:rotate-45 group-hover:scale-115" />
			)}
		</button>
	);
}
