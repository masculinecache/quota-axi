import { percentRemaining } from "../lib/time.js";
export function withRemaining(window) {
    return {
        ...window,
        percentRemaining: percentRemaining(window.percentUsed),
    };
}
export function successProvider(provider) {
    const { refreshedAt, sourcesTried, ...rest } = provider;
    return {
        ...rest,
        state: {
            status: "fresh",
            stale: false,
            refreshedAt,
            sourcesTried,
        },
    };
}
export function failedProvider(args) {
    return {
        provider: args.provider,
        label: args.label,
        source: args.source ?? "unavailable",
        windows: [],
        state: {
            status: args.status,
            stale: false,
            error: args.error,
            retryAfter: args.retryAfter,
            sourcesTried: args.sourcesTried,
        },
        attempts: args.attempts,
    };
}
export function staleFromCache(cached, error, sourcesTried, attempts) {
    return {
        ...cached,
        source: "cache",
        state: {
            ...cached.state,
            status: "stale",
            stale: true,
            error,
            sourcesTried: [...new Set([...sourcesTried, "cache"])],
        },
        attempts,
    };
}
export function statusFromError(error) {
    if (error === "keychain_prompt_required" ||
        error === "credentials_expired" ||
        /sign-in|required|reauth|access token expired/i.test(error))
        return "auth_required";
    if (/rate.?limit/i.test(error))
        return "rate_limited";
    return "error";
}
export function sourceNames(attempts) {
    return attempts.map((attempt) => attempt.source);
}
//# sourceMappingURL=common.js.map