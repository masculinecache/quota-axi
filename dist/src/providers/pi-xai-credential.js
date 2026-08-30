import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const PI_PROVIDER_ID = "xai";
const AUTH_FILE_LIMIT_BYTES = 64 * 1024;
export function createPiXaiCredentialBroker(overrides = {}) {
    const dependencies = {
        environment: process.env,
        homeDirectory: homedir,
        readFile: readBoundedFile,
        now: () => Date.now(),
        ...overrides,
    };
    return {
        resolve: () => resolveCredential(dependencies),
        inspect: async () => {
            const resolution = await resolveCredential(dependencies);
            if (resolution.status === "available") {
                return { status: "available" };
            }
            if (resolution.status === "expired") {
                return {
                    status: "expired",
                    refreshable: resolution.refreshable,
                };
            }
            if (resolution.status === "unsupported") {
                return {
                    status: "unsupported",
                    error: "unsupported_credential_type",
                };
            }
            if (resolution.status === "error") {
                return { status: "error", error: "credential_resolution_failed" };
            }
            if (resolution.status === "invalid") {
                return { status: "invalid", error: "invalid_credential" };
            }
            return { status: "missing" };
        },
    };
}
async function resolveCredential(dependencies) {
    const path = authFilePath(dependencies);
    let contents;
    try {
        contents = await dependencies.readFile(path, AUTH_FILE_LIMIT_BYTES);
    }
    catch (error) {
        return errorCode(error) === "ENOENT"
            ? { status: "missing" }
            : { status: "error" };
    }
    if (contents.byteLength > AUTH_FILE_LIMIT_BYTES) {
        return { status: "invalid" };
    }
    let parsed;
    try {
        parsed = JSON.parse(contents.toString("utf8"));
    }
    catch {
        return { status: "error" };
    }
    const root = objectValue(parsed);
    if (!root)
        return { status: "invalid" };
    const entry = objectValue(root[PI_PROVIDER_ID]);
    if (!entry)
        return { status: "missing" };
    const type = stringValue(entry.type)?.toLowerCase();
    if (type === "api_key") {
        const apiKey = usableLiteralSecret(entry.key);
        return apiKey !== undefined
            ? { status: "available", kind: "api_key", credential: apiKey }
            : { status: "invalid" };
    }
    if (type === "oauth") {
        const access = usableLiteralSecret(entry.access);
        if (access === undefined)
            return { status: "invalid" };
        const hasExpiry = Object.hasOwn(entry, "expires");
        const expiresMs = timestampMs(entry.expires);
        if (hasExpiry && expiresMs === undefined)
            return { status: "invalid" };
        if (expiresMs !== undefined && expiresMs <= dependencies.now()) {
            return {
                status: "expired",
                refreshable: usableLiteralSecret(entry.refresh) !== undefined,
            };
        }
        return { status: "available", kind: "oauth", credential: access };
    }
    if (type === undefined)
        return { status: "missing" };
    return { status: "unsupported" };
}
function authFilePath(dependencies) {
    return join(piAgentDirectory(dependencies), "auth.json");
}
function piAgentDirectory(dependencies) {
    const home = () => nonempty(dependencies.environment.HOME) ?? dependencies.homeDirectory();
    const configured = nonempty(dependencies.environment.PI_CODING_AGENT_DIR);
    if (configured === undefined) {
        return join(home(), ".pi", "agent");
    }
    if (configured === "~")
        return home();
    if (configured.startsWith("~/") ||
        (process.platform === "win32" && configured.startsWith("~\\"))) {
        return join(home(), configured.slice(2));
    }
    return configured;
}
function usableLiteralSecret(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return undefined;
    }
    // Reject environment, template, and command references without resolving them.
    if (value.startsWith("!") || value.includes("$")) {
        return undefined;
    }
    if ([...value].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code === 0x7f;
    })) {
        return undefined;
    }
    return value;
}
function timestampMs(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        // Pi stores OAuth expiry as epoch milliseconds.
        return value < 1_000_000_000_000 ? value * 1000 : value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const asNumber = Number(value);
        if (Number.isFinite(asNumber)) {
            return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
        }
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
}
async function readBoundedFile(path, maxBytes) {
    const file = await open(path, "r");
    try {
        const contents = new Uint8Array(maxBytes + 1);
        let offset = 0;
        while (offset < contents.byteLength) {
            const { bytesRead } = await file.read(contents, offset, contents.byteLength - offset, null);
            if (bytesRead === 0)
                break;
            offset += bytesRead;
        }
        return Buffer.from(contents.buffer, contents.byteOffset, offset);
    }
    finally {
        await file.close();
    }
}
function nonempty(value) {
    return value && value.length > 0 ? value : undefined;
}
function objectValue(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function stringValue(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
function errorCode(error) {
    return error !== null &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
        ? error.code
        : undefined;
}
//# sourceMappingURL=pi-xai-credential.js.map