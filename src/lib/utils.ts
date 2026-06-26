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

const logStyle = (bgColor: string) =>
	`background-color: ${bgColor}; color: #ffffff; padding: 1px 8px; border-radius: 4px; font-weight: 600; font-family: monospace; font-size: 10px;`;

export const Logging = {
	info: (msg: unknown, ...data: unknown[]) => console.log(`%c theatlas::info %c ${msg} ${data}`, logStyle("#00664e"), ""),
	done: (msg: unknown, ...data: unknown[]) => console.log(`%c theatlas::success %c ${msg} ${data}`, logStyle("#4b882e"), ""),
	warn: (msg: unknown, ...data: unknown[]) => console.log(`%c theatlas::warning %c ${msg} ${data}`, logStyle("#9b782c"), ""),
	error: (msg: unknown, ...data: unknown[]) => console.log(`%c theatlas::error %c ${msg} ${data}`, logStyle("#ba1a1a"), "")
}
