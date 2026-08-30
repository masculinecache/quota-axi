import { homedir } from "node:os";
import { join } from "node:path";
import { readCachedProvider } from "../cache.js";
import { clampPercent, nowIso } from "../lib/time.js";
import { failedProvider, sourceNames, staleFromCache, statusFromError, successProvider, withRemaining, } from "./common.js";
import { resolveApiKey } from "./credential-sources.js";

const INTl_USAGE_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
const CN_USAGE_URL = "https://open.bigmodel.cn/api/monitor/usage/quota/limit";
const API_TIMEOUT_MS = 15_000;

/**
 * Z.AI GLM Coding Plan (Lite / Pro / Max). The documented monitor endpoint
 * returns the plan level plus a list of independent usage limits — the 5-hour
 * credit window, the weekly token window, and a concurrency rate limit among
 * others — each with a percentage, remaining amount, and next reset time.
 * A rate-limit (concurrency) window is not a credit-consumption bound, so the
 * semantics adapter treats it as informational rather than bounding.
 */
export const zaiAdapter = {
    id: "zai",
    label: "Z.AI",
    fetchQuota,
    inspectAuth,
};

function credentialCandidates() {
    return [
        { kind: "env", env: "ZAI_API_KEY", source: "env:ZAI_API_KEY", value: process.env.ZAI_API_KEY },
        { kind: "env", env: "BIGMODEL_API_KEY", source: "env:BIGMODEL_API_KEY", value: process.env.BIGMODEL_API_KEY },
        {
            kind: "file",
            path: join(piAgentDirectory(), "auth.json"),
            source: "pi:zai",
            select: (root) => {
                const entry = root?.zai ?? root?.zhipu ?? root?.["z.ai"] ?? root?.glm;
                return entry?.key;
            },
        },
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
    let finalError = "Z.AI quota unavailable";
    let retryAfter;
    if (credentials !== undefined) {
        attempts.push({ source: credentials.source, status: "success" });
        try {
            const quota = await fetchZaiQuota(credentials.key);
            return successProvider({
                provider: "zai",
                label: "Z.AI",
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
            source: "env:ZAI_API_KEY",
            status: "skipped",
            error: "credentials_missing",
        });
    }
    const cached = readCachedProvider("zai");
    if (cached) {
        return staleFromCache(cached, finalError, sourceNames(attempts), attempts);
    }
    return failedProvider({
        provider: "zai",
        label: "Z.AI",
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
        provider: "zai",
        sources: credentialSources().map(({ source, path }) => ({
            source,
            path,
            status: credentials?.source === source ? "available" : "missing",
        })),
    };
}

async function fetchZaiQuota(key) {
    const endpoints = [INTl_USAGE_URL, CN_USAGE_URL];
    const auth = { authorization: `Bearer ${key}`, accept: "application/json" };
    let lastError;
    for (const url of endpoints) {
        try {
            const data = await getJson(url, auth);
            const quota = normalizeZaiQuota(data);
            if (quota) {
                return quota;
            }
        }
        catch (error) {
            if (error instanceof RateLimitError) {
                throw error;
            }
            lastError = error;
        }
    }
    if (lastError) {
        throw lastError;
    }
    throw new Error("Z.AI quota unavailable");
}

export function normalizeZaiQuota(raw) {
    if (raw === null || typeof raw !== "object") {
        return undefined;
    }
    const data = objectValue(raw.data) ?? raw;
    const level = stringValue(data.level);
    const plan = level && level !== "unknown" ? callingPlanLabel(level) : undefined;
    const limits = Array.isArray(data.limits) ? data.limits : [];
    const windows = [];
    const creditBits = [];
    const credits = {
        unit: "credits",
    };

    for (const entry of limits) {
        const limit = objectValue(entry);
        if (!limit) {
            continue;
        }
        const type = stringValue(limit.type)?.toUpperCase();
        let percentage = numberValue(limit.percentage);
        if (percentage === undefined) {
            const used = numberValue(limit.currentValue);
            const total = numberValue(limit.usage);
            if (used !== undefined && total !== undefined && total > 0) {
                percentage = (100 * used) / total;
            }
        }
        if (percentage === undefined) {
            continue;
        }
        const resetsAt = parseResetAt(limit.nextResetTime ?? limit.resetTime);
        // TOKENS_LIMIT / CREDIT_LIMIT rows carry the window length as
        // unit/number: unit 3 + number 5 is the rolling 5-hour window, unit 6 +
        // number 1 is the weekly window. TIME_LIMIT rows are the monthly MCP
        // tool budget. Anything else (RATE_LIMIT concurrency, TIMES_LIMIT,
        // SESSION_LIMIT) is informational, not a credit-consumption bound.
        if (type === "TOKENS_LIMIT" || type === "CREDIT_LIMIT") {
            const unit = numberValue(limit.unit);
            const number = numberValue(limit.number);
            if (unit === 3 && number === 5) {
                windows.push(withRemaining({
                    id: "five_hour",
                    label: "5-hour",
                    kind: "session",
                    percentUsed: clampPercent(percentage),
                    resetsAt,
                    windowSeconds: 18_000,
                }));
            }
            else if (unit === 6 && number === 1) {
                windows.push(withRemaining({
                    id: "weekly",
                    label: "Weekly",
                    kind: "weekly",
                    percentUsed: clampPercent(percentage),
                    resetsAt,
                    windowSeconds: 604_800,
                }));
            }
            else {
                // Volume window with an unfamiliar period — informational.
                windows.push(withRemaining({
                    id: `limit:${String(type).toLowerCase()}`,
                    label: `volume window`,
                    kind: "unknown",
                    percentUsed: clampPercent(percentage),
                    resetsAt,
                }));
            }
        }
        else if (type === "TIME_LIMIT") {
            windows.push(withRemaining({
                id: "monthly",
                label: "Monthly",
                kind: "monthly",
                percentUsed: clampPercent(percentage),
                resetsAt,
            }));
        }
        else {
            windows.push(withRemaining({
                id: `limit:${String(type).toLowerCase()}`,
                label: `${String(type).replace(/_/g, " ").toLowerCase()}`,
                kind: "unknown",
                percentUsed: clampPercent(percentage),
                resetsAt,
            }));
        }
        const remaining = numberValue(limit.remaining);
        if (remaining !== undefined) {
            creditBits.push({ type, remaining, percentage });
        }
    }

    if (windows.length === 0) {
        return undefined;
    }

    // Expose a coarse remaining on the credits pool from the first consuming
    // window that reports one.
    const consuming = creditBits.find((bit) => bit.type === "TIME_LIMIT" || bit.type === "TOKENS_LIMIT" || bit.type === "CREDIT_LIMIT");
    if (consuming) {
        credits.remaining = consuming.remaining;
    }

    return {
        plan,
        windows,
        credits,
        refreshedAt: nowIso(),
    };
}

function callingPlanLabel(level) {
    const map = {
        lite: "Lite",
        standard: "Standard",
        pro: "Pro",
        max: "Max",
    };
    return map[level] ?? level;
}

async function getJson(url, headers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(url, { headers, signal: controller.signal });
    }
    finally {
        clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
        throw new Error("Z.AI sign-in required");
    }
    if (response.status === 429) {
        throw new RateLimitError(retryAfterHeader(response));
    }
    if (!response.ok) {
        throw new Error(`Z.AI endpoint returned ${response.status}`);
    }
    return response.json();
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

/** Z.AI window resets are unix milliseconds; ISO and second-epoch tolerated. */
function parseResetAt(value) {
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
        return "Z.AI quota request timed out";
    }
    return error instanceof Error ? error.message : "Z.AI quota unavailable";
}

class RateLimitError extends Error {
    retryAfter;
    constructor(retryAfter) {
        super("Z.AI quota endpoint rate limited");
        this.retryAfter = retryAfter;
    }
}
