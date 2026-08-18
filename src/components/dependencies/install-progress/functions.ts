import type { InstallStatus } from "@/hooks/use-install";

/**
 * True while the backend is still working on this tool.
 *
 * "installed" and "failed" are terminal, and "idle" never started — everything
 * between them keeps the card in its busy presentation.
 */
export function isActiveInstall(status: InstallStatus | undefined): boolean {
	return (
		status === "checkingManifest" ||
		status === "downloading" ||
		status === "extracting" ||
		status === "verifying"
	);
}

export function installStatusLabel(status: InstallStatus): string {
	switch (status) {
		case "checkingManifest":
			return "Checking manifest";
		case "downloading":
			return "Downloading";
		case "extracting":
			return "Extracting";
		case "verifying":
			return "Verifying";
		case "installed":
			return "Installed";
		case "failed":
			return "Failed";
		default:
			return status;
	}
}
