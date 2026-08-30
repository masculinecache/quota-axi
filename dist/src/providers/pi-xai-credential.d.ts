export type PiXaiCredentialResolution = {
    status: "available";
    kind: "oauth" | "api_key";
    /** Present only for in-memory probe use; never log or render. */
    credential: string;
} | {
    status: "missing";
} | {
    status: "invalid";
} | {
    status: "unsupported";
} | {
    status: "expired";
    refreshable: boolean;
} | {
    status: "error";
};
export type PiXaiCredentialInspection = Exclude<PiXaiCredentialResolution["status"], "available" | "expired"> | "available" | "expired";
export type PiXaiCredentialBroker = {
    resolve(): Promise<PiXaiCredentialResolution>;
    inspect(): Promise<{
        status: PiXaiCredentialInspection;
        refreshable?: boolean;
        error?: string;
    }>;
};
type BrokerDependencies = {
    environment: Readonly<Record<string, string | undefined>>;
    homeDirectory: () => string;
    readFile: (path: string, maxBytes: number) => Promise<Buffer>;
    now: () => number;
};
export declare function createPiXaiCredentialBroker(overrides?: Partial<BrokerDependencies>): PiXaiCredentialBroker;
export {};
