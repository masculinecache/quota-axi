import { homedir } from "node:os";
import { join } from "node:path";
import { readCachedProvider } from "../cache.js";
import { clampPercent, nowIso } from "../lib/time.js";
import { failedProvider, sourceNames, staleFromCache, statusFromError, successProvider, withRemaining, } from "./common.js";
import { resolveApiKey } from "./credential-sources.js";

const GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const API_TIMEOUT_MS = 15_000;

/**
 * OpenCode Go plan. The usage endpoint is community-verified but not part of
 * the officially documented surface (anomalyco/opencode#10448 tracks a proper
 * balance/usage API), so the parser tolerates both `usage.*`-prefixed and bare
 * window keys and both `resetsAt` and `resetsInSeconds` reset forms.
 */
export const opencodeAdapter = {
    id: "opencode",
    label: "OpenCode Go",
    fetchQuota,
    inspectAuth,
};

function credentialCandidates() {
    const candidates = [];
    const authJson = join(homedir(), ".local", "share", "opencode", "auth.json");
    candidates.push({
        kind: "file",
        path: authJson,
        source: "opencode-auth-json",
        select: (root) => {
            const entry = root?.opencode ?? root?.["opencode-go"];
            return entry?.key;
        },
    });
    const piAuth = join(piAgentDirectory(), "auth.json");
    candidates.push({
        kind: "file",
        path: piAuth,
        source: "pi:opencode",
        select: (root) => root?.opencode?.key,
    });
    return candidates;
}

function credentialSources() {
    return credentialCandidates().map((candidate) => ({
        source: candidate.source,
        path: candidate.path,
    }));
}

export async function fetchQuota(_options) {
    const attempts = [];
    const credentials = resolveApiKey(credentialCandidates());
    let finalError = "OpenCode quota unavailable";
    let retryAfter;
    if (credentials !== undefined) {
        attempts.push({ source: credentials.source, status: "success" });
        try {
            const quota = await fetchGoUsage(credentials.key);
            return successProvider({
                provider: "opencode",
                label: "OpenCode Go",
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
            source: "opencode-auth-json",
            status: "skipped",
            error: "credentials_missing",
        });
    }
    const cached = readCachedProvider("opencode");
    if (cached) {
        return staleFromCache(cached, finalError, sourceNames(attempts), attempts);
    }
    return failedProvider({
        provider: "opencode",
        label: "OpenCode Go",
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
        provider: "opencode",
        sources: credentialSources().map(({ source, path }) => ({
            source,
            path,
            status: credentials?.source === source ? "available" : "missing",
        })),
    };
}

async function fetchGoUsage(key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(GO_USAGE_URL, {
            headers: {
                authorization: `Bearer ${key}`,
                accept: "application/json",
            },
            signal: controller.signal,
        });
    }
    catch (error) {
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
        throw new Error("OpenCode sign-in required");
    }
    if (response.status === 429) {
        throw new RateLimitError(retryAfterHeader(response));
    }
    if (!response.ok) {
        throw new Error(`OpenCode usage endpoint returned ${response.status}`);
    }
    const raw = await response.json();
    const quota = normalizeGoUsage(raw);
    if (!quota) {
        throw new Error("OpenCode quota unavailable");
    }
    return quota;
}

export function normalizeGoUsage(raw) {
    if (raw === null || typeof raw !== "object") {
        return undefined;
    }
    const data = raw;
    const usage = objectValue(data.usage) ?? data;
    const windows = [];
    const plan = stringValue(data.plan) ?? stringValue(data.planType);
    const pushWindow = (keys, fallback, windowSeconds, kind, id, label) => {
        let entry;
        for (const key of keys) {
            entry = objectValue(usage[key]);
            if (entry) {
                break;
            }
        }
        entry ??= fallback;
        if (!entry) {
            return;
        }
        const percent = numberValue(entry.percent) ??
            numberValue(entry.percentage) ??
            numberValue(entry.usedPercent);
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
        }));
    };
    pushWindow(["rolling", "rolling_5_hour", "five_hour"], undefined, 18_000, "session", "five_hour", "5-hour");
    pushWindow(["weekly", "week"], undefined, 604_800, "weekly", "weekly", "Weekly");
    pushWindow(["monthly", "month"], undefined, undefined, "monthly", "monthly", "Monthly");
    if (windows.length === 0) {
        return undefined;
    }
    return {
        plan,
        windows,
        credits: normalizeGoCredits(data.credits),
        refreshedAt: nowIso(),
    };
}

function normalizeGoCredits(raw) {
    const data = objectValue(raw);
    if (!data) {
        return undefined;
    }
    const balance = numberValue(data.balance);
    const unlimited = typeof data.unlimited === "boolean" ? data.unlimited : undefined;
    if (balance === undefined && unlimited === undefined) {
        return undefined;
    }
    return { remaining: balance, unlimited, unit: "usd" };
}

/**
 * Unix 0 value is a sentinel, not a reset clock. Epoch values above a 10-digit
 * threshold are milliseconds; smaller finite numbers are seconds; ISO strings
 * parse directly.
 */
function parseResetAt(entry) {
    const value = stringValue(entry.resetsAt) ?? stringValue(entry.resetAt);
    if (value !== undefined) {
        return parseEpochMsOrIso(value);
    }
    const resetsInSeconds = numberValue(entry.resetsInSeconds);
    if (resetsInSeconds !== undefined) {
        return new Date(Date.now() + resetsInSeconds * 1000).toISOString();
    }
    return undefined;
}

function parseEpochMsOrIso(value) {
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value <= 0) {
            return undefined;
        }
        return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
    }
    if (typeof value === "string" && value.trim() !== "") {
        const trimmed = value.trim();
        if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
            const numeric = Number(trimmed);
            if (numeric > 0) {
                return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000).toISOString();
            }
            return undefined;
        }
        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
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

function piAgentDirectory() {
    const configured = process.env.PI_CODING_AGENT_DIR?.trim();
    if (configured && configured !== "~") {
        return configured;
    }
    return join(homedir(), ".pi", "agent");
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

function errorMessage(error) {
    if (error instanceof Error && error.name === "AbortError") {
        return "OpenCode quota request timed out";
    }
    return error instanceof Error ? error.message : "OpenCode quota unavailable";
}

class RateLimitError extends Error {
    retryAfter;
    constructor(retryAfter) {
        super("OpenCode usage endpoint rate limited");
        this.retryAfter = retryAfter;
    }
}
