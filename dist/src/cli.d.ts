export declare const DESCRIPTION = "Report local agent-provider quota windows and model quota evidence.";
export declare const TOP_HELP = "usage: quota-axi [quota|auth|models] [flags]\ncommands[3]:\n  (none)=quota, auth, models\noutput:\n  Default TOON reports local quota evidence. models is a deterministic data join; --sort runway is explicit opt-in ordering. --tui renders a live human terminal report instead (q quits).\nflags[11]:\n  --provider <claude,codex,cursor,copilot,grok,kimi>, --json, --full, --tui, --refresh <30s-24h>, --once, --allow-keychain-prompt, --intelligence <high|medium|low>, --sort <runway>, --help, -v/--version\nexamples:\n  quota-axi\n  quota-axi --provider claude\n  quota-axi --provider cursor,copilot,grok,kimi\n  quota-axi --json\n  quota-axi --full\n  quota-axi --tui\n  quota-axi --tui --refresh 1m\n  quota-axi --tui --once\n  quota-axi auth\n  quota-axi models --intelligence high\n  quota-axi models --sort runway\n";
type MainOptions = {
    argv?: string[];
    stdout?: {
        write: (chunk: string) => unknown;
    };
    binPath?: string;
};
export declare function main(options?: MainOptions): Promise<void>;
/**
 * Route the flag-first default surface onto the `quota` command. `quota-axi`,
 * `quota-axi --json`, and `quota-axi --provider claude` all mean "run quota",
 * but runAxiCli routes on argv[0] and rejects a leading flag. Prefixing the
 * implicit `quota` command name preserves the historical surface while letting
 * the SDK own routing, help, version, and error framing.
 */
export declare function normalizeArgv(raw: string[]): string[];
export {};
