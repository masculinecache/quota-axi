import type { IntelligenceBucket, ModelSortKey, ProviderId } from "./types.js";
export type QuotaFlags = {
    providers: ProviderId[];
    json: boolean;
    full: boolean;
    tui: boolean;
    allowKeychainPrompt: boolean;
    /** Live `--tui` refresh interval; the caller applies the default. */
    refreshSeconds?: number;
    /** Render one `--tui` frame and exit instead of staying live. */
    once: boolean;
};
/** Refresh bounds: fast enough to feel live, slow enough to stay polite. */
export declare const MIN_REFRESH_SECONDS = 30;
export declare const MAX_REFRESH_SECONDS = 86400;
export type ModelsFlags = QuotaFlags & {
    intelligence?: IntelligenceBucket;
    sort?: ModelSortKey;
};
/**
 * Parse the flags shared by the `quota` and `auth` commands. Command routing is
 * owned by {@link runAxiCli}; this only interprets the flags that follow.
 * `--full` is accepted by both commands but only consumed by `quota`.
 */
export declare function parseFlags(args: string[]): QuotaFlags;
/** Parse flags accepted by the `models` evidence-join command. */
export declare function parseModelsFlags(args: string[]): ModelsFlags;
