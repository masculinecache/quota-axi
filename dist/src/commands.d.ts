import type { ProviderId, ProviderOptions, QuotaAxiResponse } from "./types.js";
export type QuotaContext = {
    binPath: string;
};
export declare function quotaCommand(args: string[], context: QuotaContext | undefined): Promise<string>;
export declare function modelsCommand(args: string[], context: QuotaContext | undefined): Promise<string>;
export declare function authCommand(args: string[], context: QuotaContext | undefined): Promise<string>;
export declare function fetchQuota(providers: ProviderId[], options: ProviderOptions): Promise<QuotaAxiResponse>;
