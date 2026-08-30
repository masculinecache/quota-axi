import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { copilotAdapter } from "./copilot.js";
import { cursorAdapter } from "./cursor.js";
import { grokAdapter } from "./grok.js";
import { kimiAdapter } from "./kimi.js";
import { opencodeAdapter } from "./opencode.js";
import { commandcodeAdapter } from "./commandcode.js";
import { zaiAdapter } from "./zai.js";
import { openrouterAdapter } from "./openrouter.js";
import { phoenixgroveAdapter } from "./phoenixgrove.js";
import { PROVIDER_IDS, } from "../types.js";
export const PROVIDERS = {
    claude: claudeAdapter,
    codex: codexAdapter,
    cursor: cursorAdapter,
    copilot: copilotAdapter,
    grok: grokAdapter,
    kimi: kimiAdapter,
    opencode: opencodeAdapter,
    commandcode: commandcodeAdapter,
    zai: zaiAdapter,
    openrouter: openrouterAdapter,
    phoenixgrove: phoenixgroveAdapter,
};
export function parseProviders(value) {
    if (!value)
        return [...PROVIDER_IDS];
    const providers = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const invalid = providers.find((provider) => !isProviderId(provider));
    if (invalid) {
        throw new Error(`unsupported provider: ${invalid}`);
    }
    return [...new Set(providers)];
}
function isProviderId(value) {
    return PROVIDER_IDS.includes(value);
}
//# sourceMappingURL=index.js.map