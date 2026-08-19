import type { VideoFormat } from "@/lib/types";

export type FormatSelectProps = {
	formats: readonly VideoFormat[];
	value: string | null;
	onChange: (formatId: string) => void;
};
