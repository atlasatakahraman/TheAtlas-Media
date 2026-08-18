import { useEffect } from "react";
import { IS_DEBUG_MODE, openDevtools } from "@/lib/debug-env";

export function useGlobalShortcuts() {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isCtrlOrMeta = e.ctrlKey || e.metaKey;
			const isShift = e.shiftKey;
			const isAlt = e.altKey;
			const key = e.key.toLowerCase();

			// 1. Block Ctrl+P / Cmd+P (Print) unconditionally
			if (isCtrlOrMeta && key === "p") {
				e.preventDefault();
				e.stopPropagation();
				return;
			}

			// 2. Block Ctrl+S / Cmd+S (Save webpage)
			if (isCtrlOrMeta && !isShift && !isAlt && key === "s") {
				e.preventDefault();
				e.stopPropagation();
				return;
			}

			// 3. DevTools / Inspection shortcuts
			const isDevToolsShortcut =
				e.key === "F12" ||
				(isCtrlOrMeta && isShift && (key === "i" || key === "j" || key === "c")) ||
				(isCtrlOrMeta && isAlt && (key === "i" || key === "j" || key === "c")) ||
				(isCtrlOrMeta && key === "u");

			if (isDevToolsShortcut) {
				e.preventDefault();
				e.stopPropagation();

				if (IS_DEBUG_MODE) {
					openDevtools();
				}
				return;
			}

			// 4. Ctrl+A / Cmd+A — restrict selection to page content container only (exclude sidebar and header)
			if (isCtrlOrMeta && !isShift && !isAlt && key === "a") {
				const active = document.activeElement;
				const isEditable =
					active instanceof HTMLInputElement ||
					active instanceof HTMLTextAreaElement ||
					(active instanceof HTMLElement && active.isContentEditable);

				if (!isEditable) {
					const pageContainer = document.getElementById("page-content-container");
					if (pageContainer) {
						e.preventDefault();
						const selection = window.getSelection();
						if (selection) {
							const range = document.createRange();
							range.selectNodeContents(pageContainer);
							selection.removeAllRanges();
							selection.addRange(range);
						}
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown, true);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
		};
	}, []);
}
