import type { QuotaAxiResponse } from "./types.js";
export declare const KEYCHAIN_ACCESS_REASON = "keychain_access_required";
export declare const KEYCHAIN_ACCESS_REMEDY_COMMAND = "quota-axi --allow-keychain-prompt";
export declare const CREDENTIALS_EXPIRED_REASON = "credentials_expired";
export declare const GROK_TOKEN_REFRESH_REMEDY_COMMAND = "grok";
export declare const GROK_ACCESS_TOKEN_EXPIRED_ERROR = "Grok access token expired";
export declare function annotateQuotaAdvice(response: Omit<QuotaAxiResponse, "schemaVersion">): QuotaAxiResponse;
export declare function quotaHelpLines(response: QuotaAxiResponse): string[];
