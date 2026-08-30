export type JsonFileReadResult = {
    status: "success";
    value: unknown;
} | {
    status: "missing";
} | {
    status: "invalid";
    error: string;
};
export declare function collapseHome(path: string): string;
export declare function cacheFilePath(): string;
export declare function claudeKeychainAccessMarkerPath(account: string, configDir?: string): string;
export declare function cursorCliKeychainAccessMarkerPath(account: string): string;
export declare function ensurePrivateParent(file: string): void;
export declare function readJsonFile(file: string): unknown | undefined;
export declare function readJsonFileResult(file: string): JsonFileReadResult;
