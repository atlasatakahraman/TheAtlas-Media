"use client";

import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pickDirectory } from "./functions";
import type { OutputDirPickerProps } from "./types";

/** Output-directory row: read-only path display plus a native folder-picker
 *  button. Shared verbatim by the download page, convert page, and download
 *  settings page. */
export default function OutputDirPicker({ value, onChange, label = "Choose…" }: OutputDirPickerProps) {
	return (
		<div className="flex items-center gap-2">
			<Input value={value} readOnly className="flex-1" />
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={async () => {
					const chosen = await pickDirectory(value);
					if (chosen) onChange(chosen);
				}}
			>
				<FolderOpen className="w-3.5 h-3.5" />
				{label}
			</Button>
		</div>
	);
}
