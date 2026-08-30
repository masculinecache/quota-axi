export declare const KIMI_CODE_CLI_CREDENTIAL_SOURCE = "kimi-code-cli";
export type KimiCodeCliCredentialResolution = {
    status: "available";
    accessToken: string;
} | {
    status: "missing" | "invalid" | "expired" | "error";
};
export type KimiCodeCliCredentialInspection = KimiCodeCliCredentialResolution["status"];
export type KimiCodeCliCredentialSource = {
    resolve(): Promise<KimiCodeCliCredentialResolution>;
    inspect(): Promise<KimiCodeCliCredentialInspection>;
};
type CredentialSourceDependencies = {
    environment: Readonly<Record<string, string | undefined>>;
    homeDirectory: () => string;
    now: () => number;
    readFile: (path: string, maxBytes: number) => Promise<Buffer>;
};
export declare function createKimiCodeCliCredentialSource(overrides?: Partial<CredentialSourceDependencies>): KimiCodeCliCredentialSource;
export {};
