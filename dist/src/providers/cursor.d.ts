import type { AuthProviderReport, ProviderAdapter, ProviderOptions, ProviderQuota, QuotaWindow } from "../types.js";
type CursorCredentials = {
    accessToken: string;
    email?: string;
    membershipType?: string;
};
export declare const cursorAdapter: ProviderAdapter;
export declare function fetchQuota(options: ProviderOptions): Promise<ProviderQuota>;
export declare function inspectAuth(options: ProviderOptions): Promise<AuthProviderReport>;
export declare function normalizeCursorUsage(usage: unknown, planInfo?: unknown, credentials?: Pick<CursorCredentials, "email" | "membershipType">): {
    plan?: string;
    account?: ProviderQuota["account"];
    windows: QuotaWindow[];
    credits?: ProviderQuota["credits"];
    refreshedAt: string;
} | undefined;
export {};
