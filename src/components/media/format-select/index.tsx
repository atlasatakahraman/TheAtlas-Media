"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatLabel } from "./functions";
import type { FormatSelectProps } from "./types";

export default function FormatSelect({ formats, value, onChange }: FormatSelectProps) {
	return (
		<Select value={value ?? undefined} onValueChange={onChange}>
			<SelectTrigger className="w-full">
				<SelectValue placeholder="Best available" />
			</SelectTrigger>
			<SelectContent>
				{formats.map((format) => (
					<SelectItem key={format.formatId} value={format.formatId}>
						{formatLabel(format)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
