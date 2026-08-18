"use client";

import * as React from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useNavigationHistory } from "@/hooks/use-navigation-history";
import { IS_DEBUG_MODE, openDevtools } from "@/lib/debug-env";
import { toast } from "sonner";
import {
	ArrowLeft,
	ArrowRight,
	RotateCw,
	Copy,
	Replace,
	Code2,
} from "lucide-react";

interface GlobalContextMenuProps {
	children: React.ReactNode;
}

export function GlobalContextMenu({ children }: GlobalContextMenuProps) {
	const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory();
	const [hasSelection, setHasSelection] = React.useState<boolean>(false);
	const [selectedText, setSelectedText] = React.useState<string>("");

	// Replace Dialog state
	const [isReplaceOpen, setIsReplaceOpen] = React.useState<boolean>(false);
	const [replacementValue, setReplacementValue] = React.useState<string>("");

	const savedRangeRef = React.useRef<Range | null>(null);
	const savedElementRef = React.useRef<Element | null>(null);
	const savedInputSelectionRef = React.useRef<{
		element: HTMLInputElement | HTMLTextAreaElement;
		start: number;
		end: number;
	} | null>(null);

	React.useEffect(() => {
		if (typeof window !== "undefined") {
			(window as unknown as { __CUSTOM_CONTEXT_MENU_ACTIVE__?: boolean }).__CUSTOM_CONTEXT_MENU_ACTIVE__ = true;
		}
	}, []);

	const updateMenuState = React.useCallback(() => {
		// 1. Text Selection Evaluation
		const selection = typeof window !== "undefined" ? window.getSelection() : null;
		const domText = selection && !selection.isCollapsed ? selection.toString() : "";
		const active = typeof document !== "undefined" ? document.activeElement : null;

		let inputSelected = "";
		if (
			active instanceof HTMLInputElement ||
			active instanceof HTMLTextAreaElement
		) {
			const start = active.selectionStart ?? 0;
			const end = active.selectionEnd ?? 0;
			if (end > start) {
				inputSelected = active.value.substring(start, end);
				savedInputSelectionRef.current = { element: active, start, end };
			} else {
				savedInputSelectionRef.current = null;
			}
		} else {
			savedInputSelectionRef.current = null;
		}

		const finalSelection = inputSelected || domText;
		const hasSel = finalSelection.trim().length > 0;

		setHasSelection(hasSel);
		setSelectedText(finalSelection);

		savedElementRef.current = active;
		if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
			savedRangeRef.current = selection.getRangeAt(0).cloneRange();
		} else if (!hasSel) {
			savedRangeRef.current = null;
		}
	}, []);

	const handleOpenChange = React.useCallback(
		(open: boolean) => {
			if (open) {
				updateMenuState();
				// Restore/keep DOM selection highlighted on right click
				if (savedRangeRef.current) {
					const sel = window.getSelection();
					if (sel && (sel.rangeCount === 0 || sel.isCollapsed)) {
						sel.removeAllRanges();
						sel.addRange(savedRangeRef.current);
					}
				}
				if (savedInputSelectionRef.current) {
					const { element, start, end } = savedInputSelectionRef.current;
					element.setSelectionRange(start, end);
				}
			}
		},
		[updateMenuState]
	);

	const handleReload = React.useCallback(() => {
		toast.info("Reloading page...", {
			description: "Refreshing window and state",
			duration: 1500,
		});
		if (typeof window !== "undefined") {
			setTimeout(() => {
				window.location.reload();
			}, 150);
		}
	}, []);

	const handleCopy = React.useCallback(async () => {
		if (!selectedText) return;
		try {
			await navigator.clipboard.writeText(selectedText);
			toast.success("Copied to clipboard");
		} catch {
			if (typeof document !== "undefined") {
				document.execCommand("copy");
				toast.success("Copied to clipboard");
			}
		}
	}, [selectedText]);

	const handleOpenReplaceDialog = React.useCallback(() => {
		setReplacementValue("");
		setIsReplaceOpen(true);
	}, []);

	const handleConfirmReplace = React.useCallback(() => {
		try {
			if (savedInputSelectionRef.current) {
				const { element, start, end } = savedInputSelectionRef.current;
				element.focus();
				element.setRangeText(replacementValue, start, end, "end");
				element.dispatchEvent(new Event("input", { bubbles: true }));
				setIsReplaceOpen(false);
				toast.success("Text replaced");
				return;
			}

			const el = savedElementRef.current;
			if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
				const start = el.selectionStart ?? 0;
				const end = el.selectionEnd ?? 0;
				el.focus();
				el.setRangeText(replacementValue, start, end, "end");
				el.dispatchEvent(new Event("input", { bubbles: true }));
				setIsReplaceOpen(false);
				toast.success("Text replaced");
				return;
			}

			if (savedRangeRef.current) {
				const range = savedRangeRef.current;
				const container = range.commonAncestorContainer;
				const parentEl =
					container.nodeType === Node.ELEMENT_NODE
						? (container as HTMLElement)
						: container.parentElement;

				if (parentEl?.isContentEditable) {
					const sel = window.getSelection();
					sel?.removeAllRanges();
					sel?.addRange(range);
					document.execCommand("insertText", false, replacementValue);
					setIsReplaceOpen(false);
					toast.success("Text replaced");
					return;
				}

				range.deleteContents();
				const textNode = document.createTextNode(replacementValue);
				range.insertNode(textNode);

				const sel = window.getSelection();
				sel?.removeAllRanges();
				const newRange = document.createRange();
				newRange.selectNode(textNode);
				sel?.addRange(newRange);
				toast.success("Text replaced");
			}
		} catch (err) {
			console.warn("Failed to replace selected text:", err);
			toast.error("Failed to replace text");
		}

		setIsReplaceOpen(false);
	}, [replacementValue]);

	const handleInspect = React.useCallback(() => {
		toast.info("Opening Developer Tools...", {
			description: "Inspect elements and console",
			duration: 2000,
		});
		openDevtools();
	}, []);

	return (
		<>
			<ContextMenu onOpenChange={handleOpenChange}>
				<ContextMenuTrigger asChild onContextMenu={updateMenuState}>
					{children}
				</ContextMenuTrigger>
				<ContextMenuContent className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
					<ContextMenuItem disabled={!canGoBack} onClick={goBack}>
						<ArrowLeft className="mr-2 h-4 w-4 transition-transform duration-200 ease-out group-hover/context-menu-item:-translate-x-1 group-focus/context-menu-item:-translate-x-1" />
						<span>Back</span>
						<ContextMenuShortcut>
							<Kbd>Alt</Kbd>
							<Kbd>←</Kbd>
						</ContextMenuShortcut>
					</ContextMenuItem>

					<ContextMenuItem disabled={!canGoForward} onClick={goForward}>
						<ArrowRight className="mr-2 h-4 w-4 transition-transform duration-200 ease-out group-hover/context-menu-item:translate-x-1 group-focus/context-menu-item:translate-x-1" />
						<span>Next</span>
						<ContextMenuShortcut>
							<Kbd>Alt</Kbd>
							<Kbd>→</Kbd>
						</ContextMenuShortcut>
					</ContextMenuItem>

					<ContextMenuItem onClick={handleReload}>
						<RotateCw className="mr-2 h-4 w-4 transition-transform duration-300 ease-out group-hover/context-menu-item:rotate-180 group-focus/context-menu-item:rotate-180" />
						<span>Reload Page</span>
						<ContextMenuShortcut>
							<Kbd>Ctrl</Kbd>
							<Kbd>R</Kbd>
						</ContextMenuShortcut>
					</ContextMenuItem>

					{hasSelection && (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem onClick={handleCopy}>
								<Copy className="mr-2 h-4 w-4 transition-transform duration-200 ease-out group-hover/context-menu-item:scale-115 group-focus/context-menu-item:scale-115" />
								<span>Copy</span>
								<ContextMenuShortcut>
									<Kbd>Ctrl</Kbd>
									<Kbd>C</Kbd>
								</ContextMenuShortcut>
							</ContextMenuItem>
							<ContextMenuItem onClick={handleOpenReplaceDialog}>
								<Replace className="mr-2 h-4 w-4 transition-transform duration-200 ease-out group-hover/context-menu-item:scale-115 group-focus/context-menu-item:scale-115" />
								<span>Replace</span>
								<ContextMenuShortcut>
									<Kbd>Ctrl</Kbd>
									<Kbd>H</Kbd>
								</ContextMenuShortcut>
							</ContextMenuItem>
						</>
					)}

					{IS_DEBUG_MODE && (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem onClick={handleInspect}>
								<Code2 className="mr-2 h-4 w-4 transition-transform duration-200 ease-out group-hover/context-menu-item:scale-115 group-focus/context-menu-item:scale-115" />
								<span>Inspect</span>
								<ContextMenuShortcut>
									<Kbd>F12</Kbd>
								</ContextMenuShortcut>
							</ContextMenuItem>
						</>
					)}
				</ContextMenuContent>
			</ContextMenu>

			{/* Replace Text Dialog */}
			<Dialog open={isReplaceOpen} onOpenChange={setIsReplaceOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Replace Text</DialogTitle>
						<DialogDescription>
							Enter replacement text for the selected content.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								Selected Text
							</span>
							<div className="max-h-24 overflow-y-auto rounded-md border border-border bg-muted/60 p-2.5 font-mono text-xs text-foreground select-text break-all">
								{selectedText}
							</div>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								Replace With
							</span>
							<Input
								autoFocus
								value={replacementValue}
								onChange={(e) => setReplacementValue(e.target.value)}
								placeholder="Enter replacement text..."
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleConfirmReplace();
									}
								}}
							/>
						</div>
					</div>
					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							variant="outline"
							onClick={() => setIsReplaceOpen(false)}
						>
							Cancel
						</Button>
						<Button onClick={handleConfirmReplace}>
							Replace
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
