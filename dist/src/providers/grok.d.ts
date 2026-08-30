import type { AuthProviderReport, ProviderAdapter, ProviderOptions, ProviderQuota, QuotaWindow } from "../types.js";
import { type PiXaiCredentialBroker } from "./pi-xai-credential.js";
type GrokCredentials = {
    key: string;
    email?: string;
    teamId?: string;
    expiresAt?: string;
};
type NormalizedGrokQuota = {
    account?: ProviderQuota["account"];
    windows: QuotaWindow[];
    credits?: ProviderQuota["credits"];
    refreshedAt: string;
};
type GrokDependencies = {
    piXaiBroker: PiXaiCredentialBroker;
};
export declare function createGrokAdapter(overrides?: Partial<GrokDependencies>): ProviderAdapter;
export declare const grokAdapter: ProviderAdapter;
export declare function fetchQuota(_options: ProviderOptions): Promise<ProviderQuota>;
export declare function inspectAuth(_options: ProviderOptions): Promise<AuthProviderReport>;
export declare function normalizeGrokConsumerPayload(payload: Uint8Array, credentials?: Pick<GrokCredentials, "email" | "teamId">): NormalizedGrokQuota;
export {};
