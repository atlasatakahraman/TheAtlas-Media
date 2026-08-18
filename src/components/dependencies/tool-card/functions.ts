import type { InstallProgress } from "@/hooks/use-install";
import type { DependencyInfo } from "@/lib/types";
import { isActiveInstall } from "../install-progress/functions";
import type { ToolCardState } from "./types";

export type ResolveToolCardStateInput = {
	info: DependencyInfo | undefined;
	installState: InstallProgress | undefined;
	mounted: boolean;
	isLoading: boolean;
	isUninstalling: boolean;
};

/**
 * Collapses the report plus local activity into the handful of booleans the
 * card and its action bar actually branch on.
 *
 * The backend report is the single source of truth for "installed". A leftover
 * `installState.status === "installed"` from earlier in the session must never
 * override it, or the card keeps claiming success after an uninstall until the
 * page reloads — `installState` is only consulted for progress and failure.
 */
export function resolveToolCardState({
	info,
	installState,
	mounted,
	isLoading,
	isUninstalling,
}: ResolveToolCardStateInput): ToolCardState {
	const isInstalled = mounted && !isLoading && !isUninstalling && info?.status === "installed";
	const isManaged = isInstalled && info?.source === "managed";
	const isExternal = isInstalled && !isManaged;

	return {
		isInstalling: isActiveInstall(installState?.status),
		isInstalled,
		isManaged,
		isExternal,
		// Only reachable via source === "env": env resolution outranks managed,
		// so a working managed copy under a "path" source would already have
		// resolved as "managed" instead.
		isShadowingManaged: isExternal && info?.source === "env" && !!info?.managedInstalled,
		// Two distinct detected installations. The user should always be able to
		// jump straight to picking between them, whatever else the card shows.
		hasTwoPaths: Boolean(
			isInstalled && info?.managedPath && info?.path && info.managedPath !== info.path
		),
		hasManagedPath: Boolean(info?.managedPath),
	};
}
