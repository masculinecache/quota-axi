import type { EffectiveAvailability, ProviderId, ProviderQuota, QuotaAxiResponse, QuotaWindow } from "./types.js";
/**
 * Human terminal report ("Direction D'"): a two-up card grid with thin
 * headroom bars and a linear-pace marker wherever pace is known. This surface is
 * presentation only - it renders the same redacted response the TOON and JSON
 * surfaces receive and derives nothing new from providers or the cache.
 */
export type TuiColorDepth = "none" | "16" | "256" | "truecolor";
export type TuiOptions = {
    /** Raw terminal width; clamped to [80, 120], defaults to 100. */
    columns?: number;
    colorDepth?: TuiColorDepth;
    /** Mirrors `--full`: appends account identity and source-attempt footers. */
    full?: boolean;
    /** IANA time zone for header/absolute times; defaults to the system zone. */
    timeZone?: string;
    /** Dim closing line used by the live report for its key hint. */
    footerHint?: string;
};
type StyleName = "dim" | "dimmer" | "dimBold" | "label" | "ok" | "okBold" | "warn" | "warnBold" | "crit" | "critBold" | "marker" | "track" | "border" | "borderDim" | `accent:${ProviderId}`;
type Segment = {
    text: string;
    style?: StyleName;
};
type Line = Segment[];
/**
 * Resolve the color depth for the TUI report from the environment. Honors
 * NO_COLOR, TERM=dumb, and non-TTY stdout (color off, glyph skeleton kept);
 * FORCE_COLOR re-enables. Truecolor requires COLORTERM=truecolor|24bit.
 */
export declare function detectTuiColorDepth(env: Record<string, string | undefined>, isTty: boolean): TuiColorDepth;
export declare function renderQuotaTui(response: QuotaAxiResponse, options?: TuiOptions): string;
/**
 * Quiet-Ledger thin bar with the linear-pace marker: fill is current
 * headroom at half-cell resolution, `┃` overwrites the cell at
 * `timeRemainingPercent` (the fill position of exactly linear burn), and the
 * marker is omitted when pace is unknown rather than faked.
 */
export declare function thinBar(percentRemaining: number | undefined, markerPercent: number | undefined, width: number): Line;
/**
 * Name the window the headline percent actually is. Effective remaining is the
 * minimum across the bounded windows, so it always equals one named window's
 * `percentRemaining` - `limitingWindowIds` is exactly that window (or the tied
 * set), and its provider label ("week", "session", "credits") is what the
 * headline bar is showing. Falls back to the model-scope wording when any
 * limiting window is unresolvable; a model-scoped headline keeps the scope as
 * a suffix so "week · fable" stays unambiguous.
 */
export declare function headlineLabel(provider: ProviderQuota, headline: EffectiveAvailability | undefined, width?: number): string;
/**
 * Compress a window label into the 7-char row column: drop a trailing
 * period/unit token ("Fable week" -> "fable", "730h window" -> "730h"),
 * then fall back to the last hyphen segment and an ellipsis.
 */
export declare function shortWindowLabel(window: QuotaWindow): string;
/** Two-unit countdown ("4h 39m", "4d 21h") degrading to one unit at 7+ chars. */
export declare function formatCountdown(seconds: number): string;
export {};
