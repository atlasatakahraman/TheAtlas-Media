import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd"
			className={cn(
				"pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 in-data-[slot=context-menu-shortcut]:h-[18px] in-data-[slot=context-menu-shortcut]:min-w-[18px] in-data-[slot=context-menu-shortcut]:text-[11px] in-data-[slot=context-menu-shortcut]:px-1.5 in-data-[slot=context-menu-shortcut]:rounded-[4px] in-data-[slot=context-menu-shortcut]:bg-background/60 in-data-[slot=context-menu-shortcut]:border in-data-[slot=context-menu-shortcut]:border-border/60 in-data-[slot=context-menu-shortcut]:font-serif in-data-[slot=context-menu-shortcut]:leading-none in-data-[slot=context-menu-shortcut]:shadow-2xs in-data-[slot=context-menu-shortcut]:gap-0 in-data-[slot=command-shortcut]:h-[18px] in-data-[slot=command-shortcut]:min-w-[18px] in-data-[slot=command-shortcut]:text-[11px] in-data-[slot=command-shortcut]:px-1.5 in-data-[slot=command-shortcut]:rounded-[4px] in-data-[slot=command-shortcut]:bg-sidebar-primary/15 in-data-[slot=command-shortcut]:border in-data-[slot=command-shortcut]:border-border/60 in-data-[slot=command-shortcut]:font-serif in-data-[slot=command-shortcut]:leading-none in-data-[slot=command-shortcut]:shadow-2xs in-data-[slot=command-shortcut]:gap-0 group-focus/context-menu-item:border-border group-focus/context-menu-item:text-foreground [&_svg:not([class*='size-'])]:size-3",
				className
			)}
			{...props}
		/>
	)
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<kbd
			data-slot="kbd-group"
			className={cn("inline-flex items-center gap-1", className)}
			{...props}
		/>
	)
}

export { Kbd, KbdGroup }
