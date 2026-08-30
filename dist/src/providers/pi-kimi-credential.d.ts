export type KimiCredentialResolution = {
    status: "available";
    kind: "oauth" | "api_key";
    /** Present only for in-memory probe use; never log or render. */
    credential: string;
} | {
    status: "missing";
} | {
    status: "expired";
    refreshable: boolean;
} | {
    status: "unsupported";
} | {
    status: "error";
};
export type KimiCredentialInspection = Exclude<KimiCredentialResolution["status"], "available"> | "available";
export type KimiCredentialBroker = {
    resolve(): Promise<KimiCredentialResolution>;
    inspect(): Promise<KimiCredentialInspection>;
};
type BrokerDependencies = {
    environment: Readonly<Record<string, string | undefined>>;
    homeDirectory: () => string;
    readFile: (path: string, maxBytes: number) => Promise<Buffer>;
    now: () => number;
};
export declare function createPiKimiCredentialBroker(overrides?: Partial<BrokerDependencies>): KimiCredentialBroker;
export {};
