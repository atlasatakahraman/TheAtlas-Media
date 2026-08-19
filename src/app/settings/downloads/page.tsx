// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-08-19
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import OutputDirPicker from "@/components/media/output-dir-picker";
import { usePref } from "@/hooks/use-pref";
import { get_default_media_output_dir, set_media_concurrency } from "@/lib/media-env";
import { kv_get, PREF_NAMESPACE } from "@/lib/prefs-env";
import { errorMessage } from "@/lib/types";
import PageShell from "@/layout/page/page-shell";
import { PAGE_DESCRIPTION, PAGE_TITLE } from "./data";

const CONCURRENCY_OPTIONS = [1, 2, 3, 4] as const;

export default function Page() {
	const outputDir = usePref<string>(PREF_NAMESPACE.media, "outputDir", "");
	const [concurrency, setConcurrency] = useState(2);

	useEffect(() => {
		if (outputDir.ready && !outputDir.value) {
			get_default_media_output_dir()
				.then((dir) => outputDir.set(dir))
				.catch((error: unknown) => {
					toast.error(errorMessage(error, "Could not resolve a default output directory"));
				});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [outputDir.ready, outputDir.value]);

	useEffect(() => {
		kv_get(PREF_NAMESPACE.media, "concurrency")
			.then((value) => {
				if (typeof value === "number") setConcurrency(value);
			})
			.catch(() => {
				// Falls back to the default of 2 — nothing persisted yet.
			});
	}, []);

	const handleConcurrencyChange = (value: string) => {
		const parsed = Number(value);
		setConcurrency(parsed);
		set_media_concurrency(parsed).catch((error: unknown) => {
			toast.error(errorMessage(error, "Could not save the concurrency limit"));
		});
	};

	return (
		<PageShell title={PAGE_TITLE} description={PAGE_DESCRIPTION} icon="Download">
			<div className="max-w-lg space-y-6">
				<div className="space-y-2">
					<label className="text-sm font-medium">Output directory</label>
					<OutputDirPicker value={outputDir.value} onChange={outputDir.set} />
				</div>

				<div className="space-y-2">
					<label className="text-sm font-medium">Concurrent jobs</label>
					<Select value={String(concurrency)} onValueChange={handleConcurrencyChange}>
						<SelectTrigger className="w-40">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CONCURRENCY_OPTIONS.map((n) => (
								<SelectItem key={n} value={String(n)}>
									{n} at a time
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</PageShell>
	);
}
