import { homedir } from "node:os";
import { join } from "node:path";
import { readCachedProvider } from "../cache.js";
import { clampPercent, nowIso, parseEpochOrIso } from "../lib/time.js";
import { failedProvider, sourceNames, staleFromCache, statusFromError, successProvider, withRemaining, } from "./common.js";
import { resolveApiKey } from "./credential-sources.js";

const KEY_URL = "https://openrouter.ai/api/v1/key";
const API_TIMEOUT_MS = 15_000;

/**
 * OpenRouter spend-cap balance. `GET /api/v1/key` with the API key reports the
 * key's spend cap (`limit`), remaining balance (`limit_remaining`), lifetime
 * spend (`usage`), and daily/weekly/monthly spend diagnostics. A spend cap is
 * a prepaid pool, not a rolling window: `limit_reset` is null unless OpenRouter
 * schedules one, so the balance surfaces as a single `credits` window with a
 * reset only when the API actually reports it.
 */
export const openrouterAdapter = {
    id: "openrouter",
    label: "OpenRouter",
    fetchQuota,
    inspectAuth,
};

function credentialCandidates() {
    return [
        { kind: "env", env: "OPENROUTER_API_KEY", source: "env:OPENROUTER_API_KEY", value: process.env.OPENROUTER_API_KEY },
        {
            kind: "file",
            path: join(homedir(), ".local", "share", "opencode", "auth.json"),
            source: "opencode-auth-json",
            select: (root) => root?.openrouter?.key,
        },
        {
            kind: "file",
            path: join(piAgentDirectory(), "auth.json"),
            source: "pi:openrouter",
            select: (root) => root?.openrouter?.key,
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
    let finalError = "OpenRouter quota unavailable";
    let retryAfter;
    if (credentials !== undefined) {
        attempts.push({ source: credentials.source, status: "success" });
        try {
            const quota = await fetchKeyBalance(credentials.key);
            return successProvider({
                provider: "openrouter",
                label: "OpenRouter",
                source: "api",
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
            source: "env:OPENROUTER_API_KEY",
            status: "skipped",
            error: "credentials_missing",
        });
    }
    const cached = readCachedProvider("openrouter");
    if (cached) {
        return staleFromCache(cached, finalError, sourceNames(attempts), attempts);
    }
    return failedProvider({
        provider: "openrouter",
        label: "OpenRouter",
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
        provider: "openrouter",
        sources: credentialSources().map(({ source, path }) => ({
            source,
            path,
            status: credentials?.source === source ? "available" : "missing",
        })),
    };
}

async function fetchKeyBalance(key) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(KEY_URL, {
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
        throw new Error("OpenRouter key rejected");
    }
    if (response.status === 429) {
        throw new RateLimitError(retryAfterHeader(response));
    }
    if (!response.ok) {
        throw new Error(`OpenRouter key endpoint returned ${response.status}`);
    }
    const raw = await response.json();
    const quota = normalizeKeyBalance(raw);
    if (!quota) {
        throw new Error("OpenRouter quota unavailable");
    }
    return quota;
}

export function normalizeKeyBalance(raw) {
    if (raw === null || typeof raw !== "object") {
        return undefined;
    }
    const data = objectValue(raw.data) ?? raw;
    const limit = numberValue(data.limit);
    const limitRemaining = numberValue(data.limit_remaining);
    const usage = numberValue(data.usage);
    const resetsAt = parseEpochOrIso(stringValue(data.limit_reset));
    const windows = [];
    if (limit !== undefined && limit > 0) {
        const remaining = limitRemaining !== undefined && limitRemaining >= 0
            ? limitRemaining
            : Math.max(limit - (usage ?? 0), 0);
        windows.push(withRemaining({
            id: "balance",
            label: "Balance",
            kind: "credits",
            percentUsed: clampPercent(100 - (100 * remaining) / limit),
            resetsAt,
            spentUsd: usage,
            limitUsd: limit,
        }));
    }
    const credits = limitRemaining !== undefined
        ? { remaining: Math.max(limitRemaining, 0), unit: "usd" }
        : (limit !== undefined && usage !== undefined
            ? { remaining: Math.max(limit - usage, 0), unit: "usd" }
            : undefined);
    if (windows.length === 0 && credits === undefined) {
        return undefined;
    }
    return {
        windows,
        credits,
        refreshedAt: nowIso(),
    };
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
        return "OpenRouter quota request timed out";
    }
    return error instanceof Error ? error.message : "OpenRouter quota unavailable";
}

class RateLimitError extends Error {
    retryAfter;
    constructor(retryAfter) {
        super("OpenRouter key endpoint rate limited");
        this.retryAfter = retryAfter;
    }
}
