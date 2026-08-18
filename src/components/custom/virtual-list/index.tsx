"use client";

import { useVirtualList } from "@/lib/list/use-virtual-list";
import { cn } from "@/lib/utils";
import type { VirtualListProps } from "./types";

/**
 * Renders only the rows inside the viewport (plus overscan).
 *
 * Trade-off worth knowing: virtualization and the sidebar's keep-everything-
 * mounted collapse animation are mutually exclusive — an unmounted row cannot
 * animate out. This component is for long ranked lists where the row count is
 * the problem; the sidebar tree keeps its collapse instead.
 */
export default function VirtualList<T>({
	items,
	itemHeight,
	renderItem,
	getKey,
	overscan,
	empty,
	className,
	itemClassName,
	"aria-label": ariaLabel,
}: VirtualListProps<T>) {
	const { scrollRef, range, totalSize, getItemStyle } = useVirtualList({
		count: items.length,
		itemHeight,
		overscan,
	});

	if (items.length === 0 && empty !== undefined) {
		return <>{empty}</>;
	}

	const rows = [];
	for (let index = range.start; index < range.end; index++) {
		const item = items[index];
		rows.push(
			<div
				key={getKey ? getKey(item, index) : index}
				className={itemClassName}
				style={getItemStyle(index)}
				data-index={index}
			>
				{renderItem(item, index)}
			</div>
		);
	}

	return (
		<div
			ref={scrollRef}
			role="list"
			aria-label={ariaLabel}
			className={cn("relative overflow-y-auto overscroll-contain", className)}
		>
			{/* Spacer carries the full scroll height; rows are absolutely placed
			    inside it via transform. */}
			<div style={{ height: totalSize, position: "relative", width: "100%" }}>
				{rows}
			</div>
		</div>
	);
}
