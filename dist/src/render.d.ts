import type { AuthProviderReport, ModelsResponse, QuotaAxiResponse } from "./types.js";
export declare function renderHelp(lines: string[]): string;
export declare function renderQuotaToon(response: QuotaAxiResponse, binPath: string, full: boolean): string;
export declare function renderAuthToon(reports: AuthProviderReport[], binPath: string): string;
export declare function renderModelsToon(response: ModelsResponse, binPath: string, full: boolean): string;
export declare function redactedResponse(response: QuotaAxiResponse, full: boolean): QuotaAxiResponse;
