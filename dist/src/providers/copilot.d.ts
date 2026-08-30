import type { AuthProviderReport, ProviderAdapter, ProviderOptions, ProviderQuota, QuotaWindow } from "../types.js";
export declare const copilotAdapter: ProviderAdapter;
export declare function fetchQuota(_options: ProviderOptions): Promise<ProviderQuota>;
export declare function inspectAuth(_options: ProviderOptions): Promise<AuthProviderReport>;
export declare function normalizeCopilotUser(raw: unknown): {
    plan?: string;
    account?: ProviderQuota["account"];
    windows: QuotaWindow[];
    refreshedAt: string;
} | undefined;
