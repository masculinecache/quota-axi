import type { AuthProviderReport, ProviderAdapter, ProviderOptions, ProviderQuota, QuotaWindow } from "../types.js";
type ClaudeAccount = NonNullable<ProviderQuota["account"]>;
export declare const claudeAdapter: ProviderAdapter;
export declare function fetchQuota(options: ProviderOptions): Promise<ProviderQuota>;
export declare function inspectAuth(options: ProviderOptions): Promise<AuthProviderReport>;
export declare function normalizeClaudeApiUsage(raw: unknown, plan?: string): {
    plan?: string;
    windows: QuotaWindow[];
    refreshedAt: string;
} | undefined;
export declare function normalizeClaudeProfile(raw: unknown): ClaudeAccount | undefined;
export declare function claudeCredentialFile(): string;
export declare function claudeKeychainService(): string;
export declare function claudeKeychainAccount(): string;
export {};
