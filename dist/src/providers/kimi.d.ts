import { deleteCachedProvider as deleteCachedProviderFromDisk, readCachedProvider as readCachedProviderFromDisk } from "../cache.js";
import type { ProviderAdapter, QuotaWindow } from "../types.js";
import { type KimiCodeCliCredentialSource } from "./kimi-code-cli-credential.js";
import { type KimiCredentialBroker } from "./pi-kimi-credential.js";
export type KimiDiagnostic = {
    code: "limits_missing";
} | {
    code: "limits_invalid";
} | {
    code: "detail_invalid";
    index: number;
};
export type NormalizedKimiPayload = {
    windows: QuotaWindow[];
    diagnostics: KimiDiagnostic[];
};
type KimiDependencies = {
    broker: KimiCredentialBroker;
    cliCredentialSource: KimiCodeCliCredentialSource;
    fetch: typeof globalThis.fetch;
    readCachedProvider: typeof readCachedProviderFromDisk;
    deleteCachedProvider: typeof deleteCachedProviderFromDisk;
    now: () => number;
    deadlineMs: number;
};
export declare function createKimiAdapter(overrides?: Partial<KimiDependencies>): ProviderAdapter;
export declare const kimiAdapter: ProviderAdapter;
export declare function normalizeKimiPayload(payload: unknown): NormalizedKimiPayload;
export declare function normalizeRetryAfter(value: string | null, receivedAt: number): string | undefined;
export {};
