/** "125.5" seconds -> "2:05". */
export function formatDuration(durationSecs: number | null): string | null {
	if (durationSecs == null) return null;
	const total = Math.round(durationSecs);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const paddedSeconds = seconds.toString().padStart(2, "0");
	return hours > 0
		? `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`
		: `${minutes}:${paddedSeconds}`;
}
