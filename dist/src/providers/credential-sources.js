import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readJsonFileResult } from "../lib/fs.js";

/**
 * Shared credential sources for the aggregate-plan providers (opencode,
 * commandcode, zai). These providers authenticate with a single literal API
 * key stored under a known local file or environment variable, so they share
 * one small bounded reader instead of each duplicating the read.
 *
 * Everything here is read-only and data-only: it never launches a harness
 * CLI, never imports browser cookies, and never prints secret values.
 */

const AUTH_FILE_LIMIT_BYTES = 128 * 1024;

export function resolveApiKey(candidates) {
    for (const candidate of candidates) {
        if (candidate.kind === "env") {
            const value = candidate.value?.trim();
            if (isUsableLiteral(value)) {
                return { key: value, source: candidate.source, path: undefined };
            }
            continue;
        }
        if (candidate.kind === "file") {
            const path = expandHome(candidate.path);
            const result = readJsonFileResult(path);
            if (result.status === "missing" || result.status === "invalid") {
                continue;
            }
            const key = extractApiKey(result.value, candidate.select);
            if (isUsableLiteral(key)) {
                return { key, source: candidate.source, path };
            }
            continue;
        }
        if (candidate.kind === "text-file") {
            const path = expandHome(candidate.path);
            let contents;
            try {
                contents = readFileSync(path, "utf8");
            }
            catch {
                continue;
            }
            if (contents.length > AUTH_FILE_LIMIT_BYTES) {
                continue;
            }
            const key = contents.trim();
            if (isUsableLiteral(key)) {
                return { key, source: candidate.source, path };
            }
            continue;
        }
    }
    return undefined;
}

/** Extract an API key from an already-parsed JSON root using a selector. */
function extractApiKey(root, select) {
    if (typeof select === "string") {
        return nestedString(root, select);
    }
    if (typeof select === "function") {
        try {
            const value = select(root);
            return typeof value === "string" && value.trim() ? value : undefined;
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}

function nestedString(root, dotPath) {
    let current = root;
    for (const segment of dotPath.split(".")) {
        if (current === null || typeof current !== "object") {
            return undefined;
        }
        current = current[segment];
    }
    return typeof current === "string" && current.trim() ? current : undefined;
}

function isUsableLiteral(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return false;
    }
    // Reject environment, template, and command references without resolving
    // them, mirroring the existing pi credential broker.
    if (value.startsWith("!") || value.includes("$")) {
        return false;
    }
    if ([...value].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code === 0x7f;
    })) {
        return false;
    }
    return true;
}

function expandHome(path) {
    if (path === "~") {
        return homedir();
    }
    if (path.startsWith("~/")) {
        return join(homedir(), path.slice(2));
    }
    return path;
}
