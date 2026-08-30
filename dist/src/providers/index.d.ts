import { type ProviderAdapter, type ProviderId } from "../types.js";
export declare const PROVIDERS: Record<ProviderId, ProviderAdapter>;
export declare function parseProviders(value: string | undefined): ProviderId[];
