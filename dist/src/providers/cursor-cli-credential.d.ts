import type { AuthSourceReport, ProviderOptions } from "../types.js";
/**
 * The Cursor CLI (`cursor-agent`) keeps sign-in identity in a plain
 * `cli-config.json` and the tokens themselves in the macOS login Keychain,
 * unlike the Cursor editor which keeps both in its `state.vscdb`. This module
 * reads only the access token, only on macOS, and only through the same
 * `--allow-keychain-prompt` gate the Claude keychain source uses.
 *
 * Access-token refresh is intentionally not implemented: the sibling
 * `cursor-refresh-token` item is never read, because quota-axi does not mutate
 * provider state and has no first-party refresh contract to rely on. An expired
 * access token therefore surfaces as `Cursor sign-in required`, whose remedy is
 * running `cursor-agent login` again.
 */
export declare const CURSOR_CLI_SOURCE = "cli-keychain";
export declare const CURSOR_CLI_KEYCHAIN_SERVICE = "cursor-access-token";
export declare const CURSOR_CLI_KEYCHAIN_ACCOUNT = "cursor-user";
export type CursorCliIdentity = {
    email?: string;
    userId?: string;
};
export type CursorCliCredentialState = {
    status: "available";
    accessToken: string;
    identity: CursorCliIdentity;
    source: AuthSourceReport;
} | {
    status: "missing" | "invalid" | "skipped";
    source: AuthSourceReport;
};
type IdentityResult = {
    status: "present";
    identity: CursorCliIdentity;
} | {
    status: "missing";
} | {
    status: "invalid";
    error: string;
};
/** The Cursor CLI token store is the macOS login Keychain only. */
export declare function isCursorCliSourceSupported(): boolean;
export declare function cursorCliConfigPath(): string;
export declare function readCursorCliCredentialState(options: ProviderOptions, presenceOnly?: boolean): Promise<CursorCliCredentialState>;
/** Identity only: `cli-config.json` never holds a token. */
export declare function readCursorCliIdentity(path: string): IdentityResult;
export {};
