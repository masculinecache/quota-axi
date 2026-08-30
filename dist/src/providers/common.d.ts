import type { ProviderQuota, ProviderSource, ProviderStatus, QuotaWindow, SourceAttempt } from "../types.js";
export declare function withRemaining(window: Omit<QuotaWindow, "percentRemaining">): QuotaWindow;
export declare function successProvider(provider: Omit<ProviderQuota, "state"> & {
    refreshedAt: string;
    sourcesTried: string[];
}): ProviderQuota;
export declare function failedProvider(args: {
    provider: ProviderQuota["provider"];
    label: string;
    status: ProviderStatus;
    error: string;
    sourcesTried: string[];
    source?: ProviderSource;
    retryAfter?: string;
    attempts?: SourceAttempt[];
}): ProviderQuota;
export declare function staleFromCache(cached: ProviderQuota, error: string, sourcesTried: string[], attempts: SourceAttempt[]): ProviderQuota;
export declare function statusFromError(error: string): ProviderStatus;
export declare function sourceNames(attempts: SourceAttempt[]): string[];
