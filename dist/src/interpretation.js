import { computeEffectiveRunway, computeWindowPace, summarizeEffectivePace, } from "./pace.js";
export function withQuotaSemantics(provider, generatedAt) {
    const windows = provider.windows.map((window) => ({
        ...window,
        pace: computeWindowPace(window, generatedAt, {
            stale: provider.state.stale,
        }),
    }));
    const withWindows = { ...provider, windows };
    const semantics = semanticsFor(withWindows, generatedAt);
    return {
        ...withWindows,
        quotaSemantics: provider.state.stale
            ? staleSemantics(semantics)
            : semantics,
    };
}
function staleSemantics(semantics) {
    return {
        status: semantics.status === "partial" ? "partial" : "unknown",
        description: "The raw quota windows are stale diagnostic data, so effective remaining is unknown until the provider refreshes successfully.",
        effectiveAvailability: semantics.effectiveAvailability.map(({ scope, boundedBy, pace }) => ({
            scope,
            status: "unknown",
            boundedBy,
            runway: {
                status: "unknown",
                ...(boundedBy.length > 0 ? { unmeasurableWindowIds: boundedBy } : {}),
            },
            ...(pace
                ? {
                    pace: {
                        status: "unknown",
                        ...(pace.unknownWindowIds
                            ? { unknownWindowIds: pace.unknownWindowIds }
                            : boundedBy.length > 0
                                ? { unknownWindowIds: boundedBy }
                                : {}),
                    },
                }
                : boundedBy.length > 0
                    ? {
                        pace: {
                            status: "unknown",
                            unknownWindowIds: boundedBy,
                        },
                    }
                    : {}),
        })),
        ...(semantics.unresolvedWindowIds
            ? { unresolvedWindowIds: semantics.unresolvedWindowIds }
            : {}),
    };
}
function semanticsFor(provider, generatedAt) {
    switch (provider.provider) {
        case "claude":
            return claudeSemantics(provider.windows, generatedAt);
        case "codex":
            return codexSemantics(provider.windows, generatedAt);
        case "grok":
            return grokSemantics(provider.windows, generatedAt);
        case "kimi":
            return kimiSemantics(provider.windows, provider.state.untrustedWindowIds ?? [], generatedAt);
        case "opencode":
        case "commandcode":
        case "phoenixgrove":
            return aggregatePlanSemantics(provider.windows, generatedAt, "All reported windows cap the same included plan pool, so effective remaining is the minimum across the named windows.");
        case "zai":
            return aggregatePlanSemantics(provider.windows, generatedAt, "Z.AI's 5-hour and weekly credit windows bound usage; rate-limit and other informational windows do not contribute to effective remaining.");
        case "openrouter":
            return aggregatePlanSemantics(provider.windows, generatedAt, "The key's spend cap bounds its prepaid balance, so effective remaining is the balance pool remaining.");
        case "cursor":
        case "copilot":
            return unknownSemantics(provider.windows, `quota-axi does not know whether ${provider.label}'s reported windows are independent or jointly bounding, so it does not claim an effective remaining percentage.`);
        default:
            return unknownSemantics(provider.windows, `quota-axi does not know how ${provider.label}'s reported windows bound each other, so it does not claim an effective remaining percentage.`);
    }
}
/** All windows (or the credit-bearing subset) jointly bound one plan pool. */
function aggregatePlanSemantics(windows, generatedAt, description) {
    const bounding = windows.filter(({ kind }) => kind !== "unknown");
    if (bounding.length === 0) {
        return unknownSemantics(windows, "No consumable quota windows are available, so no effective remaining percentage can be computed.");
    }
    return knownSemantics([availability("all_plan", bounding, generatedAt)], description);
}
function claudeSemantics(windows, generatedAt) {
    const account = windows.filter(({ id }) => ["five_hour", "seven_day"].includes(id));
    const models = windows.filter(({ kind }) => kind === "model");
    const unresolved = windows.filter(({ id, kind }) => !["five_hour", "seven_day", "extra_usage"].includes(id) &&
        kind !== "model");
    if (unresolved.length > 0) {
        return partialSemantics(unresolved, "Claude account windows bound every model and model windows add another bound, but unfamiliar windows prevent a definitive effective percentage.");
    }
    const effectiveAvailability = [];
    if (account.length > 0) {
        effectiveAvailability.push(availability("all_models", account, generatedAt));
    }
    for (const model of models) {
        effectiveAvailability.push(availability(model.id, [...account, model], generatedAt));
    }
    return knownSemantics(effectiveAvailability, "Claude account windows bound every model. A model-specific window is an additional bound, so that model's effective remaining percentage is the minimum across the named windows.");
}
function codexSemantics(windows, generatedAt) {
    const account = windows.filter(isCodexAccountWindow);
    const codeReview = windows.filter(({ id }) => id.startsWith("code_review_five_hour") ||
        id.startsWith("code_review_weekly") ||
        id.startsWith("code_review_window:"));
    const modelWindows = windows.filter(({ kind }) => kind === "model");
    const models = new Map();
    for (const window of modelWindows) {
        const scope = codexModelScope(window.id);
        const scoped = models.get(scope) ?? [];
        scoped.push(window);
        models.set(scope, scoped);
    }
    const recognized = new Set([...account, ...codeReview, ...modelWindows]);
    const unresolved = windows.filter((window) => !recognized.has(window));
    if (unresolved.length > 0) {
        return partialSemantics(unresolved, "Codex base account windows bound every model and named model windows add model-specific bounds, but unfamiliar windows prevent a definitive effective percentage.");
    }
    const effectiveAvailability = [];
    if (account.length > 0) {
        effectiveAvailability.push(availability("all_models", account, generatedAt));
    }
    if (codeReview.length > 0) {
        effectiveAvailability.push(availability("code_review", codeReview, generatedAt));
    }
    for (const [scope, modelWindows] of models) {
        effectiveAvailability.push(availability(scope, [...account, ...modelWindows], generatedAt));
    }
    return knownSemantics(effectiveAvailability, "Codex base account windows bound every model. Named model windows add bounds for that model; code-review windows describe a separate workload and are not included in model availability.");
}
function grokSemantics(windows, generatedAt) {
    const shared = windows.filter(({ id }) => id === "credits");
    const products = windows.filter(({ id }) => id.startsWith("product:"));
    const unresolved = windows.filter(({ id }) => id !== "credits" && !id.startsWith("product:"));
    if (unresolved.length > 0) {
        return partialSemantics(unresolved, "Grok's shared credits window bounds every product and each product window adds a product-specific bound, but unfamiliar windows prevent a definitive effective percentage.");
    }
    const effectiveAvailability = [];
    if (shared.length > 0) {
        effectiveAvailability.push(availability("all_products", shared, generatedAt));
    }
    for (const product of products) {
        effectiveAvailability.push(availability(product.id, [...shared, product], generatedAt));
    }
    return knownSemantics(effectiveAvailability, "Grok's shared credits window bounds every product. A product window is an additional bound, so that product's effective remaining percentage is the minimum across the named windows.");
}
function kimiSemantics(windows, untrustedWindowIds, generatedAt) {
    const unresolved = windows.filter(({ id }) => id !== "weekly" && id !== "five_hour");
    const unresolvedWindowIds = [
        ...new Set([...unresolved.map(({ id }) => id), ...untrustedWindowIds]),
    ];
    if (unresolvedWindowIds.length > 0) {
        const recognized = windows.filter(({ id }) => id === "weekly" || id === "five_hour");
        return {
            status: "partial",
            description: "Kimi's valid weekly and five-hour account windows are known bounds, but unrecognized or unparsed limits may add bounds, so effective remaining is unknown.",
            effectiveAvailability: recognized.length > 0
                ? [
                    {
                        scope: "all_models",
                        status: "unknown",
                        boundedBy: recognized.map(({ id }) => id),
                        pace: summarizeEffectivePace(recognized),
                        runway: {
                            status: "unknown",
                            unmeasurableWindowIds: [
                                ...recognized.map(({ id }) => id),
                                ...unresolvedWindowIds,
                            ],
                        },
                    },
                ]
                : [],
            unresolvedWindowIds,
        };
    }
    const effectiveAvailability = windows.length > 0
        ? [availability("all_models", windows, generatedAt)]
        : [];
    return knownSemantics(effectiveAvailability, "Kimi's weekly and five-hour account windows jointly bound every model, so effective remaining is the minimum across the named windows.");
}
function availability(scope, windows, generatedAt) {
    const boundedBy = windows.map(({ id }) => id);
    const remaining = windows.map(({ percentRemaining }) => percentRemaining);
    const pace = summarizeEffectivePace(windows);
    if (remaining.length === 0 ||
        remaining.some((value) => value === undefined)) {
        return {
            scope,
            status: "unknown",
            boundedBy,
            pace,
            runway: computeEffectiveRunway(windows, generatedAt),
        };
    }
    const effectivePercentRemaining = Math.min(...remaining);
    return {
        scope,
        status: "known",
        effectivePercentRemaining,
        boundedBy,
        limitingWindowIds: windows
            .filter(({ percentRemaining }) => percentRemaining === effectivePercentRemaining)
            .map(({ id }) => id),
        pace,
        runway: computeEffectiveRunway(windows, generatedAt),
    };
}
function isCodexAccountWindow(window) {
    return (/^(?:five_hour|weekly)(?:_\d+)?$/.test(window.id) ||
        window.id.startsWith("window:"));
}
function codexModelScope(id) {
    return id.replace(/_\d+$/, "").replace(/:(?:5h|7d|window:[^:]+)$/, "");
}
function knownSemantics(effectiveAvailability, description) {
    return {
        status: effectiveAvailability.length > 0 ? "known" : "unknown",
        description: effectiveAvailability.length > 0
            ? description
            : "No quota windows are available, so no effective remaining percentage can be computed.",
        effectiveAvailability,
    };
}
function partialSemantics(unresolved, description) {
    return {
        status: "partial",
        description,
        effectiveAvailability: [],
        unresolvedWindowIds: unresolved.map(({ id }) => id),
    };
}
function unknownSemantics(windows, description) {
    return {
        status: "unknown",
        description: windows.length > 0
            ? description
            : "No quota windows are available, so no effective remaining percentage can be computed.",
        effectiveAvailability: [],
        unresolvedWindowIds: windows.map(({ id }) => id),
    };
}
//# sourceMappingURL=interpretation.js.map