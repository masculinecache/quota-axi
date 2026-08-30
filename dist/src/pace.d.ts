import type { EffectivePaceSummary, EffectiveRunway, QuotaPace, QuotaWindow } from "./types.js";
/** Reserve within this many percentage points of zero is treated as on_pace. */
export declare const PACE_ON_PACE_DEADBAND_PERCENT_POINTS = 1;
/**
 * Linear exhaustion projections before this much of the cycle has elapsed are
 * labeled `early` rather than `established`.
 */
export declare const PACE_EARLY_ELAPSED_PERCENT = 10;
type PaceOptions = {
    stale?: boolean;
};
export declare function computeWindowPace(window: QuotaWindow, generatedAt: string, options?: PaceOptions): QuotaPace;
export declare function computeEffectiveRunway(windows: QuotaWindow[], generatedAt: string): EffectiveRunway;
export declare function summarizeEffectivePace(windows: QuotaWindow[]): EffectivePaceSummary;
export {};
