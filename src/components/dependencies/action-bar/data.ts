/**
 * Minimum WebView cache before clearing is offered, in MB.
 *
 * Below this the reclaimed space is not worth the slower first paint that
 * follows, so the button stays disabled and says why.
 */
export const CACHE_CLEAR_THRESHOLD_MB = 70;

/** Cache sizes under this are treated as empty and hidden from the button. */
export const CACHE_DISPLAY_FLOOR_MB = 0.01;
