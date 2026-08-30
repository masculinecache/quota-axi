import { homedir } from "node:os";
import { join } from "node:path";
import { readCachedProvider } from "../cache.js";
import { clampPercent, nowIso } from "../lib/time.js";
import { failedProvider, sourceNames, staleFromCache, statusFromError, successProvider, withRemaining, } from "./common.js";
import { resolveApiKey } from "./credential-sources.js";

const BASE_URL = "https://api.commandcode.ai";
const WHOAMI_URL = `${BASE_URL}/alpha/whoami`;
const CREDITS_URL = `${BASE_URL}/alpha/billing/credits`;
const SUBSCRIPTIONS_URL = `${BASE_URL}/alpha/billing/subscriptions`;
const SUMMARY_URL = `${BASE_URL}/alpha/usage/summary`;
const API_TIMEOUT_MS = 15_000;

/**
 * Command Code GOAT (and other subscription) plan. The live usage meters,
 * window caps, and reset times are served by the same `/alpha/*` endpoints the
 * official CLI's `/usage` view uses:
 *   GET /alpha/whoami                      -> org id
 *   GET /alpha/billing/subscriptions?orgId -> planId + billing period
 *   GET /alpha/billing/credits?orgId       -> credit pools + live 5h/weekly windows
 *   GET /alpha/usage/summary?orgId&since   -> period spend/tokens
 * Each endpoint degrades independently so a transient failure never blanks the
 * whole report. Bearer auth with the same API key that authenticates the CLI.
 */
export const commandcodeAdapter = {
    id: "commandcode",
    label: "Command Code",
    fetchQuota,
    inspectAuth,
};

function credentialCandidates() {
    return [
        { kind: "env", env: "COMMAND_CODE_API_KEY", source: "env:COMMAND_CODE_API_KEY", value: process.env.COMMAND_CODE_API_KEY },
        { kind: "text-file", path: "~/.config/opencode/.command-code.key", source: "command-code-key-file" },
        {
            kind: "file",
            path: join(piAgentDirectory(), "models.json"),
            source: "pi:commandcode",
            select: (root) => root?.providers?.commandcode?.apiKey,
        },
    ];
}

function credentialSources() {
    return credentialCandidates().map((candidate) => ({
        source: candidate.source,
        path: "path" in candidate ? candidate.path : undefined,
    }));
}

export async function fetchQuota(_options) {
    const attempts = [];
    const credentials = resolveApiKey(credentialCandidates());
    let finalError = "Command Code quota unavailable";
    let retryAfter;
    if (credentials !== undefined) {
        attempts.push({ source: credentials.source, status: "success" });
        try {
            const quota = await fetchCommandCodeQuota(credentials.key);
            return successProvider({
                provider: "commandcode",
                label: "Command Code",
                source: "api",
                plan: quota.plan,
                account: quota.account,
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
            source: "command-code-key-file",
            status: "skipped",
            error: "credentials_missing",
        });
    }
    const cached = readCachedProvider("commandcode");
    if (cached) {
        return staleFromCache(cached, finalError, sourceNames(attempts), attempts);
    }
    return failedProvider({
        provider: "commandcode",
        label: "Command Code",
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
        provider: "commandcode",
        sources: credentialSources().map(({ source, path }) => ({
            source,
            path,
            status: credentials?.source === source ? "available" : "missing",
        })),
    };
}

async function fetchCommandCodeQuota(key) {
    const auth = { authorization: `Bearer ${key}`, accept: "application/json" };
    const whoami = await getJson(WHOAMI_URL, auth).catch(() => undefined);
    // The org id is optional: personal accounts report org:null and every
    // /alpha/* endpoint still answers without it.
    const orgId = stringValue(whoami?.org?.id) ?? stringValue(whoami?.orgId);
    const orgQuery = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";

    const [creditsRes, subscriptionRes] = await Promise.allSettled([
        getJson(`${CREDITS_URL}${orgQuery}`, auth),
        getJson(`${SUBSCRIPTIONS_URL}${orgQuery}`, auth),
    ]);
    const credits = creditsRes.status === "fulfilled" ? creditsRes.value : undefined;
    const subscription = subscriptionRes.status === "fulfilled" ? subscriptionRes.value : undefined;

    let summary;
    const subData = objectValue(subscription?.data) ?? subscription;
    const periodStart = stringValue(subData?.currentPeriodStart);
    const since = periodStart ?? stringValue(subData?.createdAt);
    if (since) {
        const summaryUrl = `${SUMMARY_URL}?${orgId ? `orgId=${encodeURIComponent(orgId)}&` : ""}since=${encodeURIComponent(since)}`;
        try {
            summary = await getJson(summaryUrl, auth);
        }
        catch {
            summary = undefined;
        }
    }

    return normalizeCommandCodeQuota(whoami, credits, subscription, summary);
}

/**
 * Pure normalization of the Command Code `/alpha/*` endpoint bodies, kept
 * exported for unit testing without network access.
 */
export function normalizeCommandCodeQuota(whoami, creditsRaw, subscriptionRaw, summary) {
    const credits = objectValue(creditsRaw);
    const subscription = objectValue(subscriptionRaw);
    const subData = objectValue(subscription?.data) ?? subscription;
    const planId = stringValue(subData?.planId) ?? stringValue(whoami?.planId);
    const periodStart = stringValue(subData?.currentPeriodStart);
    const periodEnd = stringValue(subData?.currentPeriodEnd);
    const orgId = stringValue(whoami?.org?.id) ?? stringValue(whoami?.orgId);

    const windows = [];
    if (credits) {
        windows.push(...windowLimitsFromCredits(credits));
    }

    // Monthly window: spend over the current billing period against the plan's
    // documented monthly pool. The summary endpoint degrades independently.
    let spend;
    if (summary) {
        spend = numberValue(summary.totalMonthlyCredits) ?? numberValue(summary.totalCost);
    }
    if (periodStart) {
        const cap = monthlyCapUsd(planId);
        windows.push(withRemaining({
            id: "monthly",
            label: "Monthly",
            kind: "monthly",
            percentUsed: spend !== undefined && cap !== undefined && cap > 0
                ? clampPercent((100 * spend) / cap)
                : undefined,
            startsAt: periodStart,
            resetsAt: periodEnd,
            spentUsd: spend,
            limitUsd: cap,
        }));
    }

    const account = {
        organization: stringValue(whoami?.org?.name) ?? stringValue(whoami?.org?.orgName) ?? stringValue(subData?.orgName),
        email: stringValue(whoami?.user?.email),
        accountId: (orgId ?? stringValue(whoami?.user?.id) ?? stringValue(subData?.userId)),
    };

    return {
        plan: planId,
        account: account.email || account.organization || account.accountId ? account : undefined,
        windows,
        credits: normalizeCredits(credits, planId),
        refreshedAt: nowIso(),
    };
}

function windowLimitsFromCredits(credits) {
    const windows = [];
    const limits = objectValue(credits.windowLimits) ?? objectValue(credits.window_limits);
    if (limits) {
        const fiveHour = objectValue(limits.fiveHour) ?? objectValue(limits.five_hour);
        const weekly = objectValue(limits.weekly);
        const fiveHourWindow = windowFromLimit(fiveHour, "five_hour", "5-hour", "session", 18_000);
        const weeklyWindow = windowFromLimit(weekly, "weekly", "Weekly", "weekly", 604_800);
        if (fiveHourWindow) {
            windows.push(fiveHourWindow);
        }
        if (weeklyWindow) {
            windows.push(weeklyWindow);
        }
    }
    return windows.filter((window) => window !== undefined);
}

function windowFromLimit(limit, id, label, kind, windowSeconds) {
    if (!limit) {
        return undefined;
    }
    const cap = numberValue(limit.cap) ?? numberValue(limit.limit);
    const used = numberValue(limit.used) ?? numberValue(limit.usedUsd);
    if (cap === undefined || used === undefined) {
        return undefined;
    }
    return withRemaining({
        id,
        label,
        kind,
        percentUsed: clampPercent(cap > 0 ? (100 * used) / cap : 0),
        resetsAt: parseResetAt(limit.resetAt ?? limit.resetsAt),
        windowSeconds,
        spentUsd: used,
        limitUsd: cap,
    });
}

/** Documented monthly credit pool per plan id (USD). Unknown plans stay unknown. */
function monthlyCapUsd(planId) {
    if (!planId) {
        return undefined;
    }
    const match = /individual-(goat|pro|max-10x|max-20x|go|team-pro)/i.exec(planId);
    if (!match) {
        return undefined;
    }
    const caps = {
        goat: 70,
        pro: 80,
        "max-10x": 150,
        "max-20x": 300,
        go: 10,
        "team-pro": 40,
    };
    return caps[match[1].toLowerCase()];
}

function normalizeCredits(credits, planId) {
    if (!credits) {
        return undefined;
    }
    const pool = objectValue(credits.credits) ?? credits;
    void pool;
    const cap = monthlyCapUsd(planId);
    if (cap === undefined) {
        return undefined;
    }
    return { remaining: cap, unit: "usd" };
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
        throw new Error("Command Code sign-in required");
    }
    if (response.status === 429) {
        throw new RateLimitError(retryAfterHeader(response));
    }
    if (!response.ok) {
        throw new Error(`Command Code endpoint returned ${response.status}`);
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

/**
 * Command Code window resets are unix milliseconds (and never 0). ISO strings
 * and second-epoch values are tolerated where other surrogates appear.
 */
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
        return "Command Code quota request timed out";
    }
    return error instanceof Error ? error.message : "Command Code quota unavailable";
}

class RateLimitError extends Error {
    retryAfter;
    constructor(retryAfter) {
        super("Command Code quota endpoint rate limited");
        this.retryAfter = retryAfter;
    }
}
