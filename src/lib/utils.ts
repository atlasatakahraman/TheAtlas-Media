import { openUrl } from "@tauri-apps/plugin-opener";
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function openLink(href: string) {
	try {
		openUrl(href);
	} catch (e) {
		console.error(e);
	}
}

export function replaceTurkishLetters(str: string): string {
	return str
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/ğ/g, 'g')
		.replace(/Ğ/g, 'g')
		.replace(/ü/g, 'u')
		.replace(/Ü/g, 'u')
		.replace(/ş/g, 's')
		.replace(/Ş/g, 's')
		.replace(/ı/g, 'i')
		.replace(/İ/g, 'i')
		.replace(/ö/g, 'o')
		.replace(/Ö/g, 'o')
		.replace(/ç/g, 'c')
		.replace(/Ç/g, 'c');
}

export function formatSizeMb(mb: number | null | undefined): string {
	if (mb === null || mb === undefined || isNaN(mb) || mb < 0) return "Calculating…";
	if (mb === 0) return "0 B";
	const bytes = mb * 1024 * 1024;
	return formatSizeBytes(bytes);
}

/**
 * Format a raw byte count using binary units (KiB / MiB / GiB).
 * Sub-1 KiB values show as "N B"; sub-1 MiB show as "N KiB"; the rest use MiB
 * or GiB with one decimal place and a leading "~" tilde.
 */
export function formatSizeBytes(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined || isNaN(bytes) || bytes < 0) return "Calculating…";
	if (bytes === 0) return "0 B";
	const KiB = 1024;
	const MiB = 1024 * KiB;
	const GiB = 1024 * MiB;
	if (bytes < KiB) return `${Math.round(bytes)} B`;
	if (bytes < MiB) return `~${Math.round(bytes / KiB)} KiB`;
	if (bytes >= GiB) {
		const gb = bytes / GiB;
		return `~${(Math.floor(gb * 10) / 10).toFixed(1)} GiB`;
	}
	const mib = bytes / MiB;
	return `~${(Math.floor(mib * 10) / 10).toFixed(1)} MiB`;
}


const logStyle = (bgColor: string) =>
	`background-color: ${bgColor}; color: #ffffff; padding: 1px 8px; border-radius: 4px; font-weight: 600; font-family: monospace; font-size: 10px;`;

export const Logging = {
	info: (msg: unknown, ...data: unknown[]) => console.log(`%c theatlas::info %c ${msg} ${data}`, logStyle("#00664e"), ""),
	done: (msg: unknown, ...data: unknown[]) => console.log(`%c theatlas::success %c ${msg} ${data}`, logStyle("#4b882e"), ""),
	warn: (msg: unknown, ...data: unknown[]) => console.log(`%c theatlas::warning %c ${msg} ${data}`, logStyle("#9b782c"), ""),
	error: (msg: unknown, ...data: unknown[]) => console.log(`%c theatlas::error %c ${msg} ${data}`, logStyle("#ba1a1a"), "")
}

