import type { AuthProviderReport, ProviderAdapter, ProviderOptions, ProviderQuota, QuotaWindow } from "../types.js";
export declare const codexAdapter: ProviderAdapter;
export declare function fetchQuota(_options: ProviderOptions): Promise<ProviderQuota>;
export declare function inspectAuth(_options: ProviderOptions): Promise<AuthProviderReport>;
export declare function normalizeCodexUsage(raw: unknown): {
    plan?: string;
    account?: ProviderQuota["account"];
    windows: QuotaWindow[];
    credits?: ProviderQuota["credits"];
    refreshedAt: string;
} | undefined;
export declare function mergeAccountAndLimits(account: unknown, limits: unknown): Record<string, unknown>;
