export const KEYCHAIN_ACCESS_REASON = "keychain_access_required";
export const KEYCHAIN_ACCESS_REMEDY_COMMAND = "quota-axi --allow-keychain-prompt";
export const CREDENTIALS_EXPIRED_REASON = "credentials_expired";
export const GROK_TOKEN_REFRESH_REMEDY_COMMAND = "grok";
export const GROK_ACCESS_TOKEN_EXPIRED_ERROR = "Grok access token expired";
export function annotateQuotaAdvice(response) {
    const providers = response.providers.map(annotateProviderAdvice);
    const help = providers.flatMap(providerHelpLines);
    return {
        generatedAt: response.generatedAt,
        schemaVersion: 3,
        providers,
        ...(help.length > 0 ? { help } : {}),
    };
}
export function quotaHelpLines(response) {
    return [
        ...(response.help ?? []),
        "Default TOON reports effective headroom and usable runway; use --json or --full for reserve diagnostics",
        "Run `quota-axi --provider claude --json` for JSON output",
        "Run `quota-axi --full` to include account, source-attempt, and reserve details",
        "Run `quota-axi auth` to inspect local auth source availability without printing secrets",
    ];
}
function annotateProviderAdvice(provider) {
    if (needsKeychainAccessAdvice(provider)) {
        return {
            ...provider,
            state: {
                ...provider.state,
                reason: KEYCHAIN_ACCESS_REASON,
                remedyCommand: KEYCHAIN_ACCESS_REMEDY_COMMAND,
            },
        };
    }
    if (needsGrokTokenRefreshAdvice(provider)) {
        return {
            ...provider,
            state: {
                ...provider.state,
                reason: CREDENTIALS_EXPIRED_REASON,
                remedyCommand: GROK_TOKEN_REFRESH_REMEDY_COMMAND,
            },
        };
    }
    return provider;
}
function needsKeychainAccessAdvice(provider) {
    const attempts = provider.attempts ?? [];
    return (provider.state.status !== "fresh" &&
        !attempts.some((attempt) => attempt.status === "success") &&
        attempts.some(isBlockedCredentialAttempt) &&
        attempts.some(isPromptBlockedKeychainAttempt));
}
function needsGrokTokenRefreshAdvice(provider) {
    return (provider.provider === "grok" &&
        provider.state.status !== "fresh" &&
        provider.state.authStatus === "expired_refreshable" &&
        provider.state.error === GROK_ACCESS_TOKEN_EXPIRED_ERROR);
}
function isBlockedCredentialAttempt(attempt) {
    if (isKeychainSource(attempt.source))
        return false;
    if (attempt.status === "skipped")
        return true;
    return (attempt.status === "failed" &&
        isDefinitiveCredentialRejection(attempt.error));
}
function isDefinitiveCredentialRejection(error) {
    if (!error)
        return false;
    return (/^credentials_(?:missing|invalid|expired)$/i.test(error) ||
        /\bsign-in required\b/i.test(error) ||
        /\b(?:unauthorized|forbidden)\b/i.test(error) ||
        /(?:^|\D)(?:401|403)(?:\D|$)/.test(error));
}
/** Providers name their Keychain source `keychain` or `<store>-keychain`. */
function isKeychainSource(source) {
    return source === "keychain" || source.endsWith("-keychain");
}
function isPromptBlockedKeychainAttempt(attempt) {
    return (isKeychainSource(attempt.source) &&
        attempt.status === "skipped" &&
        attempt.error === "keychain_prompt_required" &&
        attempt.credentialPresent === true);
}
function providerHelpLines(provider) {
    if (hasKeychainAccessAdvice(provider))
        return [keychainAccessHelpLine(provider)];
    if (hasGrokTokenRefreshAdvice(provider))
        return [grokTokenRefreshHelpLine()];
    return [];
}
function hasKeychainAccessAdvice(provider) {
    return (provider.state.reason === KEYCHAIN_ACCESS_REASON &&
        provider.state.remedyCommand === KEYCHAIN_ACCESS_REMEDY_COMMAND);
}
function hasGrokTokenRefreshAdvice(provider) {
    return (provider.state.reason === CREDENTIALS_EXPIRED_REASON &&
        provider.state.remedyCommand === GROK_TOKEN_REFRESH_REMEDY_COMMAND);
}
function keychainAccessHelpLine(provider) {
    return `Tell your user: run \`${KEYCHAIN_ACCESS_REMEDY_COMMAND}\` once and approve Keychain access ("Always Allow") so quota-axi can read ${provider.provider}'s live quota.`;
}
function grokTokenRefreshHelpLine() {
    return `Tell your user: open the Grok CLI (\`${GROK_TOKEN_REFRESH_REMEDY_COMMAND}\`) once so it can refresh Grok's local session token. quota-axi does not refresh credentials.`;
}
//# sourceMappingURL=advice.js.map