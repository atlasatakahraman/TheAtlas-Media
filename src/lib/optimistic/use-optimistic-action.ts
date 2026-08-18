"use client";

import { useCallback, useOptimistic, useRef, useTransition } from "react";

export type OptimisticActionOptions<T> = {
	/** The authoritative value. Once `commit` lands and the owning store
	 *  updates, this is what the hook settles back to. */
	current: T;
	/** Default projection used when `run()` is called with no argument — the
	 *  "toggle" case. */
	project?: (previous: T) => T;
	/** The real write. Throwing reverts the optimistic value. */
	commit: (next: T) => Promise<void> | void;
	onError?: (error: unknown, attempted: T, previous: T) => void;
	onSuccess?: (settled: T) => void;
};

export type OptimisticAction<T> = {
	/** Paint this. It is the projected value from the moment of the click. */
	value: T;
	/** True while a commit is in flight. Drive opacity only — never geometry. */
	pending: boolean;
	run: (next?: T | ((previous: T) => T)) => void;
};

/**
 * Instant-feedback wrapper around an async write.
 *
 * The click registers on the same frame; the IPC round-trip happens behind it.
 * If the commit rejects, React unwinds the optimistic value back to `current`
 * automatically when the transition settles, and `onError` fires so the caller
 * can toast.
 *
 * Rapid repeat clicks are handled by a monotonic sequence number: each `run`
 * projects from the *last intended* value rather than from `current` (which
 * lags by a round-trip), and only the newest commit is allowed to report a
 * result. A stale rejection from an earlier click cannot clobber a newer intent.
 */
export function useOptimisticAction<T>({
	current,
	project,
	commit,
	onError,
	onSuccess,
}: OptimisticActionOptions<T>): OptimisticAction<T> {
	const [value, setValue] = useOptimistic<T, T>(current, (_previous, next) => next);
	const [pending, startTransition] = useTransition();

	const sequenceRef = useRef(0);
	// Last value this hook *intended*, independent of what has landed. Null once
	// everything in flight has settled, so the next click re-bases on `current`.
	const intentRef = useRef<T | null>(null);

	const run = useCallback(
		(next?: T | ((previous: T) => T)) => {
			const base = intentRef.current !== null ? intentRef.current : current;

			let resolved: T;
			if (typeof next === "function") {
				resolved = (next as (previous: T) => T)(base);
			} else if (next !== undefined) {
				resolved = next;
			} else if (project) {
				resolved = project(base);
			} else {
				return;
			}

			intentRef.current = resolved;
			const sequence = ++sequenceRef.current;

			startTransition(async () => {
				setValue(resolved);
				try {
					await commit(resolved);
				} catch (error) {
					if (sequence === sequenceRef.current) {
						intentRef.current = null;
						onError?.(error, resolved, base);
					}
					return;
				}
				if (sequence === sequenceRef.current) {
					intentRef.current = null;
					onSuccess?.(resolved);
				}
			});
		},
		[current, project, commit, onError, onSuccess, setValue]
	);

	return { value, pending, run };
}
