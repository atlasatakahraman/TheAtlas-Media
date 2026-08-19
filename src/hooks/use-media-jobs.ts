"use client";

import { useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { cancel_media_job, get_media_history, list_media_jobs, type JobId } from "@/lib/media-env";
import { createStore, shallowEqual, useStore } from "@/lib/store/create-store";
import { createFrameBatcher } from "@/lib/timing";
import type { JobProgress, JobSnapshot } from "@/lib/types";

/**
 * Streaming job state for the media queue — mirrors `use-install.ts`'s shape
 * with one deliberate deviation: `useJobProgress` cleans up its listener on
 * unmount instead of subscribing for the app's lifetime. `install-progress`
 * has at most three possible tool names, so an app-lifetime listener never
 * accumulates; job ids are unbounded over a session, so a per-job listener
 * that never unsubscribes would leak one per job forever.
 */

// ── Live job snapshots ──────────────────────────────────────────────────────
// Low-frequency: one write per status transition (queued -> running ->
// finalizing -> completed/failed/cancelled), never per progress tick.

const jobsStore = createStore<Record<JobId, JobSnapshot>>({});

function writeJob(snapshot: JobSnapshot): void {
	jobsStore.set((prev) => ({ ...prev, [snapshot.id]: snapshot }));
}

let listenerStarted = false;

/**
 * Subscribes to the backend's `media:job` stream, once per app. Started
 * lazily from the first mounted consumer rather than at import: the static
 * export prerenders these modules in Node, where there is no Tauri host to
 * listen to.
 */
function ensureJobListener(): void {
	if (listenerStarted || typeof window === "undefined") return;
	listenerStarted = true;

	listen<JobSnapshot>("media:job", (event) => {
		writeJob(event.payload);
	}).catch((error: unknown) => {
		listenerStarted = false;
		console.error("Failed to subscribe to media job events", error);
	});
}

/**
 * Seeds `jobsStore` from `list_media_jobs` (live) and `get_media_history`
 * (terminal). `jobsStore` otherwise only holds jobs enqueued or ticked during
 * this session, so a job started before `/files/queue` was open would
 * otherwise show up nowhere until its next event.
 */
export async function refreshFromServer(): Promise<void> {
	const [live, history] = await Promise.all([list_media_jobs(), get_media_history()]);
	jobsStore.set((prev) => {
		const next = { ...prev };
		for (const job of [...history, ...live]) next[job.id] = job;
		return next;
	});
}

// Initial app-startup seed. Skipped during the static export prerender,
// where there is no Tauri host to answer — mirrors `use-dependency.ts`.
// The rejection is swallowed here rather than left to `void`: `/files/queue`
// re-runs this on mount and surfaces the failure as a toast there.
if (typeof window !== "undefined") {
	refreshFromServer().catch((error: unknown) => {
		console.error("Failed to seed media jobs", error);
	});
}

function selectJobsSorted(state: Record<JobId, JobSnapshot>): JobSnapshot[] {
	return Object.values(state).sort((a, b) => b.queuedAt - a.queuedAt);
}

/** Every known job (live + history), newest first. Starts the shared
 *  `media:job` listener on first mount. */
export function useJobs(): JobSnapshot[] {
	useEffect(() => {
		ensureJobListener();
	}, []);
	return useStore(jobsStore, selectJobsSorted, shallowEqual);
}

// ── Per-job progress ─────────────────────────────────────────────────────────
// High-frequency: throttled server-side to ~4Hz already, coalesced again here
// through one RAF batcher per subscribed job so a tick never costs more than
// one render per animation frame.

const progressStore = createStore<Record<JobId, JobProgress>>({});

/** Live progress for one job. Subscribes to `media:progress:{id}` for as
 *  long as the calling component stays mounted, and unsubscribes on
 *  unmount or id change. `null` means "no job yet" — no listener is
 *  registered, so a page with an idle form costs nothing. */
export function useJobProgress(id: JobId | null): JobProgress | undefined {
	useEffect(() => {
		if (id == null || typeof window === "undefined") return;

		const batcher = createFrameBatcher<JobProgress>((progress) => {
			progressStore.set((prev) => ({ ...prev, [id]: progress }));
		});

		let unlisten: (() => void) | undefined;
		let unmounted = false;

		listen<JobProgress>(`media:progress:${id}`, (event) => {
			batcher.push(event.payload);
		})
			.then((stop) => {
				if (unmounted) stop();
				else unlisten = stop;
			})
			.catch((error: unknown) => {
				console.error(`Failed to subscribe to progress for job ${id}`, error);
			});

		return () => {
			unmounted = true;
			batcher.cancel();
			unlisten?.();
		};
	}, [id]);

	const selectProgress = useCallback(
		(state: Record<JobId, JobProgress>) => (id == null ? undefined : state[id]),
		[id],
	);
	return useStore(progressStore, selectProgress);
}

// ── Actions ───────────────────────────────────────────────────────────────────

/** Cancels a job and, on success, optimistically marks it cancelled locally
 *  so the UI does not wait for the next `media:job` event. */
export async function cancelJob(id: JobId): Promise<boolean> {
	const cancelled = await cancel_media_job(id);
	if (cancelled) {
		jobsStore.set((prev) => {
			const job = prev[id];
			return job ? { ...prev, [id]: { ...job, status: "cancelled" } } : prev;
		});
	}
	return cancelled;
}
