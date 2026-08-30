import { readCachedProvider } from "../cache.js";
import { clampPercent, nowIso, parseEpochOrIso } from "../lib/time.js";
import { failedProvider, sourceNames, staleFromCache, statusFromError, successProvider, withRemaining, } from "./common.js";
import { resolveApiKey } from "./credential-sources.js";

const USAGE_URL = "https://api.pgsgrove.com/v1/usage";
const CHAT_PROBE_URL = "https://api.pgsgrove.com/v1/chat/completions";
const CHAT_PROBE_MODEL = "glm-5.3-flash";
const API_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 10_000;
export const KEY_VALID_USAGE_DENIED_ERROR = "key-valid-usage-denied: PGS /v1/usage does not accept plan keys (chat auth OK)";

/**
 * Phoenix Grove Systems (PGS). The key-authenticated usage endpoint is
 * `GET /v1/usage` (Bearer `pgsk_...`); the server's own route listing on an
 * unauthenticated 404 names it (`GET /models, /usage`) and it rejects missing
 * keys with "Use `Bearer pgsk_...`", so this is a real key-gated read. The
 * 200 response body shape is not part of a documented surface (the docs SPA
 * has no /docs/usage page and there is no OpenAPI spec), so the parser is
 * deliberately tolerant: percent/percentage/usedPercent style gauges, used/cap
 * pairs, remaining pools, and `bank`/`banked` usage-bank fields are mapped
 * when present; unknown bodies yield no window rather than a fake one.
 */
export const phoenixgroveAdapter = {
    id: "phoenixgrove",
    label: "Phoenix Grove",
    fetchQuota,
    inspectAuth,
};

function credentialCandidates() {
    return [
        { kind: "env", env: "PHOENIXGROVE_API_KEY", source: "env:PHOENIXGROVE_API_KEY", value: process.env.PHOENIXGROVE_API_KEY },
        { kind: "env", env: "PGS_API_KEY", source: "env:PGS_API_KEY", value: process.env.PGS_API_KEY },
        { kind: "text-file", path: "~/.config/opencode/.phoenixgrove-key", source: "phoenixgrove-key-file" },
    ];
}

function credentialSources() {
    return credentialCandidates().map((candidate) => ({
        source: candidate.source,
        path: candidate.kind === "file" ? candidate.path : undefined,
    }));
}

export async function fetchQuota(_options) {
    const attempts = [];
    const credentials = resolveApiKey(credentialCandidates());
    let finalError = "Phoenix Grove quota unavailable";
    let retryAfter;
    if (credentials !== undefined) {
        attempts.push({ source: credentials.source, status: "success" });
        try {
            const quota = await fetchUsage(credentials.key);
            return successProvider({
                provider: "phoenixgrove",
                label: "Phoenix Grove",
                source: "api",
                plan: quota.plan,
                windows: quota.windows,
                credits: quota.credits,
                refreshedAt: quota.refreshedAt,
                sourcesTried: sourceNames(attempts),
                attempts,
            });
        }
        catch (error) {
            if (error instanceof AuthRejectedError) {
                const probe = await probeChatAuth(credentials.key);
                if (probe) {
                    finalError = KEY_VALID_USAGE_DENIED_ERROR;
                    attempts[attempts.length - 1] = {
                        source: credentials.source,
                        status: "failed",
                        error: finalError,
                    };
                    const keyValidCached = readCachedProvider("phoenixgrove");
                    const keyValidProvider = keyValidCached
                        ? staleFromCache(keyValidCached, finalError, sourceNames(attempts), attempts)
                        : failedProvider({
                            provider: "phoenixgrove",
                            label: "Phoenix Grove",
                            status: "unavailable",
                            error: finalError,
                            sourcesTried: sourceNames(attempts),
                            attempts,
                        });
                    return withAuthStatus(keyValidProvider, "valid");
                }
            }
            finalError = errorMessage(error);
            attempts[attempts.length - 1] = {
                source: credentials.source,
                status: "failed",
                error: finalError,
            };
            if (error instanceof RateLimitError) {
                retryAfter = error.retryAfter;
            }
        }
    }
    else {
        attempts.push({
            source: "env:PHOENIXGROVE_API_KEY",
            status: "skipped",
            error: "credentials_missing",
        });
    }
    const cached = readCachedProvider("phoenixgrove");
    if (cached) {
        return staleFromCache(cached, finalError, sourceNames(attempts), attempts);
    }
    return failedProvider({
        provider: "phoenixgrove",
        label: "Phoenix Grove",
        status: retryAfter ? "rate_limited" : statusFromError(finalError),
        error: finalError,
        retryAfter,
        sourcesTried: sourceNames(attempts),
        attempts,
    });
}

export async function inspectAuth(_options) {
    const credentials = resolveApiKey(credentialCandidates());
    return {
        provider: "phoenixgrove",
        sources: credentialSources().map(({ source, path }) => ({
            source,
            path,
            status: credentials?.source === source ? "available" : "missing",
        })),
    };
}

async function fetchUsage(key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(USAGE_URL, {
            headers: {
                authorization: `Bearer ${key}`,
                accept: "application/json",
            },
            signal: controller.signal,
        });
    }
    finally {
        clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
        throw new AuthRejectedError("Phoenix Grove key rejected");
    }
    if (response.status === 429) {
        throw new RateLimitError(retryAfterHeader(response));
    }
    if (!response.ok) {
        throw new Error(`Phoenix Grove usage endpoint returned ${response.status}`);
    }
    const raw = await response.json();
    const quota = normalizeUsage(raw);
    if (!quota) {
        throw new Error("Phoenix Grove quota unavailable");
    }
    return quota;
}

/**
 * Pure normalization of the PGS `GET /v1/usage` body, kept exported for unit
 * testing without network access. Tolerant of the undocumented envelope:
 * accepts a top-level object, `{data: ...}`, or `{usage: ...}` nesting, and
 * maps any recognized window/gauge entry. Unrecognized bodies return
 * undefined so callers report "unavailable" instead of inventing a window.
 */
export function normalizeUsage(raw) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    const data = objectValue(raw.data) ?? objectValue(raw.usage) ?? raw;
    const gauge = objectValue(data.usage) ?? data;
    const plan = stringValue(data.plan) ?? stringValue(data.tier) ?? stringValue(data.planId);
    const windows = [];
    const pushWindow = (entry, id, label, kind, windowSeconds) => {
        if (!entry) {
            return;
        }
        const percent = numberValue(entry.percent) ??
            numberValue(entry.percentage) ??
            numberValue(entry.usedPercent) ??
            percentFromUsedCap(entry);
        if (percent === undefined) {
            return;
        }
        windows.push(withRemaining({
            id,
            label,
            kind,
            percentUsed: clampPercent(percent),
            resetsAt: parseResetAt(entry),
            windowSeconds,
            spentUsd: numberValue(entry.used) ?? numberValue(entry.spent) ?? numberValue(entry.usedUsd),
            limitUsd: numberValue(entry.cap) ?? numberValue(entry.limit),
        }));
    };
    pushWindow(objectValue(data.window) ?? objectValue(data.current) ?? gauge, "five_hour", "5-hour", "session", 18_000);
    const named = objectValue(data.windows);
    if (named) {
        pushWindow(objectValue(named.fiveHour) ?? objectValue(named.five_hour), "five_hour", "5-hour", "session", 18_000);
        pushWindow(objectValue(named.weekly) ?? objectValue(named.week), "weekly", "Weekly", "weekly", 604_800);
    }
    pushWindow(objectValue(data.week) ?? objectValue(data.weekly), "weekly", "Weekly", "weekly", 604_800);
    pushWindow(objectValue(data.bank) ?? objectValue(data.usageBank) ?? objectValue(data.usage_bank), "bank", "Usage bank", "credits");
    if (windows.length === 0) {
        return undefined;
    }
    const remaining = numberValue(data.remaining) ??
        numberValue(data.bankRemaining) ??
        numberValue(data.bank_remaining) ??
        numberValue(data.balance);
    return {
        plan,
        windows,
        credits: remaining !== undefined ? { remaining, unit: "credits" } : undefined,
        refreshedAt: nowIso(),
    };
}

function percentFromUsedCap(entry) {
    const used = numberValue(entry.used);
    const cap = numberValue(entry.cap) ?? numberValue(entry.limit);
    if (used === undefined || cap === undefined || cap <= 0) {
        return undefined;
    }
    return (100 * used) / cap;
}

function parseResetAt(entry) {
    const value = entry.resetsAt ?? entry.resetAt ?? entry.nextResetTime;
    if (typeof value === "number") {
        // Millisecond epochs (> 10^10) pass through; smaller numbers are seconds.
        if (!Number.isFinite(value) || value <= 0) {
            return undefined;
        }
        return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
    }
    if (value !== undefined) {
        return parseEpochOrIso(value);
    }
    const resetsInSeconds = numberValue(entry.resetsInSeconds);
    if (resetsInSeconds !== undefined) {
        return new Date(Date.now() + resetsInSeconds * 1000).toISOString();
    }
    return undefined;
}

function retryAfterHeader(response) {
    const value = response.headers.get("retry-after")?.trim();
    if (!value) {
        return undefined;
    }
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return new Date(Date.now() + seconds * 1000).toISOString();
    }
    return undefined;
}

function objectValue(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}

function stringValue(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}

/**
 * Cheap authenticated probe to distinguish "key valid but /v1/usage denies
 * plan keys" from "key genuinely rejected everywhere". One POST chat
 * completion with max_tokens 1 on a cheap model, bounded timeout, single
 * attempt. Returns true only on a 2xx response.
 */
async function probeChatAuth(key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        const response = await fetch(CHAT_PROBE_URL, {
            method: "POST",
            headers: {
                authorization: `Bearer ${key}`,
                "content-type": "application/json",
                accept: "application/json",
            },
            body: JSON.stringify({
                model: CHAT_PROBE_MODEL,
                max_tokens: 1,
                messages: [{ role: "user", content: "ping" }],
            }),
            signal: controller.signal,
        });
        return response.ok;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(timer);
    }
}

function withAuthStatus(provider, authStatus) {
    return {
        ...provider,
        state: {
            ...provider.state,
            authStatus,
        },
    };
}

class AuthRejectedError extends Error {
}

function errorMessage(error) {
    if (error instanceof Error && error.name === "AbortError") {
        return "Phoenix Grove quota request timed out";
    }
    return error instanceof Error ? error.message : "Phoenix Grove quota unavailable";
}

class RateLimitError extends Error {
    retryAfter;
    constructor(retryAfter) {
        super("Phoenix Grove usage endpoint rate limited");
        this.retryAfter = retryAfter;
    }
}
