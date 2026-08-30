import type { ProviderId, ProviderQuota } from "./types.js";
export declare function readCachedProvider(provider: ProviderId): ProviderQuota | undefined;
export declare function writeCachedProviders(providers: ProviderQuota[]): void;
export declare function deleteCachedProvider(provider: ProviderId): void;
