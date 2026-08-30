import { mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
export function collapseHome(path) {
    const home = homedir();
    if (path === home)
        return "~";
    if (!isAbsolute(path) && !startsWithHomePrefix(path, home))
        return path;
    const relativePath = relative(home, path);
    if (relativePath === "")
        return "~";
    if (isHomeRelativePath(relativePath))
        return `~/${normalizeRelativePath(relativePath)}`;
    if (startsWithHomePrefix(path, home))
        return `~/${path.slice(home.length + 1).replace(/\\/g, "/")}`;
    return path;
}
function isHomeRelativePath(path) {
    return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
function normalizeRelativePath(path) {
    return sep === "\\" ? path.replace(/\\/g, "/") : path;
}
function startsWithHomePrefix(path, home) {
    const separator = path[home.length];
    return (separator !== undefined &&
        (separator === "/" || separator === "\\") &&
        samePath(path.slice(0, home.length), home));
}
function samePath(left, right) {
    if (process.platform === "win32")
        return left.toLowerCase() === right.toLowerCase();
    return left === right;
}
export function cacheFilePath() {
    return join(cacheDirPath(), "quotas.json");
}
export function claudeKeychainAccessMarkerPath(account, configDir) {
    const profileSuffix = configDir
        ? `-${createHash("sha256").update(configDir).digest("hex").slice(0, 8)}`
        : "";
    const accountSuffix = createHash("sha256")
        .update(account)
        .digest("hex")
        .slice(0, 16);
    return join(cacheDirPath(), `claude-keychain-access-granted${profileSuffix}-account-${accountSuffix}`);
}
export function cursorCliKeychainAccessMarkerPath(account) {
    const accountSuffix = createHash("sha256")
        .update(account)
        .digest("hex")
        .slice(0, 16);
    return join(cacheDirPath(), `cursor-cli-keychain-access-granted-account-${accountSuffix}`);
}
function cacheDirPath() {
    const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
    return join(base, "quota-axi");
}
export function ensurePrivateParent(file) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
}
export function readJsonFile(file) {
    const result = readJsonFileResult(file);
    return result.status === "success" ? result.value : undefined;
}
export function readJsonFileResult(file) {
    let text;
    try {
        text = readFileSync(file, "utf8");
    }
    catch (error) {
        if (errorCode(error) === "ENOENT")
            return { status: "missing" };
        return { status: "invalid", error: "file_read_error" };
    }
    try {
        return { status: "success", value: JSON.parse(text) };
    }
    catch {
        return { status: "invalid", error: "json_parse_error" };
    }
}
function errorCode(error) {
    return error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
        ? error.code
        : undefined;
}
//# sourceMappingURL=fs.js.map