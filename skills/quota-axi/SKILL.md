---
name: quota-axi
description: "Report local Claude, Codex, Cursor, GitHub Copilot, Grok, Kimi, OpenCode Go, Command Code, Z.AI GLM Coding Plan, and OpenRouter quota windows via the quota-axi CLI - remaining effective usable runway, percentages, reset times, cycle-average pace vs the reset clock, and provider status read from local auth sources, with no routing, provider mutation, or default ordering preference. Use before deciding whether it is safe to keep spending a provider's quota, when the user asks about usage, rate limits, pace, or remaining quota, or when comparing local provider headroom."
user-invocable: false
author: Kun Chen (kunchenguid)
metadata:
  hermes:
    tags:
      [
        quota,
        rate-limits,
        pace,
        claude,
        codex,
        cursor,
        copilot,
        grok,
        kimi,
        opencode,
        commandcode,
        zai,
        openrouter,
        phoenixgrove,
        cli,
      ]
    category: observability
---

# quota-axi

Report local agent-provider quota windows and model quota evidence.

You do not need quota-axi installed globally - invoke it with `npx -y quota-axi`.

quota-axi is data only: it never routes, recommends a provider, model, harness, credential, or
route, proxies, intercepts, logs in, imports browser cookies, or mutates provider state. Default
output has no ordering preference. The explicit `models --sort runway` comparator only orders
quota evidence, preserves ties, and is never a recommendation. It reads local provider auth sources and calls
first-party provider quota, usage, billing, or entitlement endpoints; it never launches the
Claude, Cursor, Grok, Pi, or Kimi CLIs, so it cannot spend the quota it measures.

## When to use

Use quota-axi whenever you need local quota headroom before deciding whether it is safe to
keep working on a provider, when the user asks about usage, rate limits, or remaining quota,
or when comparing supported local provider headroom side by side.

## Workflow

1. Run `npx -y quota-axi` for compact TOON output covering supported providers' quota windows.
2. Scope to one provider with `--provider claude` or to a subset with `--provider cursor,copilot,grok,kimi`.
3. Pass `--json` for the normalized machine-readable model instead of TOON. Read
   `quotaSemantics.effectiveAvailability` rather than treating a model window in isolation:
   account windows can bound every model, and `boundedBy` names every window included in the
   effective percentage. Read `effectiveAvailability[].runway` first for completion-risk evidence
   across every authoritative bound: `projected_exhaustion` supplies the earliest finite
   `usableRunwaySeconds`, `projectedExhaustedAt`, limiting window, and confidence; `through_reset`
   deliberately has no synthetic deadline; `exhausted_now` is zero runway; and `unknown` names
   unmeasurable bounds instead of inventing a conclusion. Read each window's `pace` (and the
   effective scope's pace summary) for diagnostics. Default TOON omits raw numeric reserve;
   `--json` and `--full` retain it. If relationship status is `partial` or `unknown`, do not infer
   one. Stale reports keep raw windows for diagnostics, but effective availability, pace, and
   runway are always unknown; never route from a stale raw percentage as though it were current
   headroom. Default output has no ordering preference. For a provider-native model evidence join,
   use `npx -y quota-axi models --intelligence high --json`. This catalog covers Claude, Codex,
   Grok, and Kimi only; its buckets are coarse editorial classifications, not scores. Its response
   includes catalog provenance and unmatched model windows. `--sort runway` is an explicit,
   documented quota-evidence comparator, not a provider, model, harness, credential, or route
   recommendation; inspect `sort.tieGroups` rather than treating equal evidence as a preference.
4. Pass `--full` to include account identity, per-source attempts, and raw reserve diagnostics.
5. Run `npx -y quota-axi auth` to check local auth-source availability without printing
   secret values.
6. On macOS, Claude and Cursor CLI Keychain value reads are skipped by default until the user
   grants access once. If quota output reports `reason: keychain_access_required`, tell your user
   to run `quota-axi --allow-keychain-prompt` once and approve Keychain access ("Always Allow").
   Plain calls then reuse the corresponding account-scoped access marker. Claude's marker is also
   profile-scoped and its Keychain lookup is pinned to Claude Code's validated current-user
   account. Cursor's `cli-keychain` source is used only when its non-prompting editor source has no
   usable token; quota-axi never reads `cursor-refresh-token`, so an expired CLI access token
   requires `cursor-agent login`. Legacy Claude markers are not reused.
7. For Grok, read `state.authStatus` before any logout wording. `expired_refreshable` means a
   local session still looks signed in but short-lived access expired. Only when quota-axi also
   emits `reason: credentials_expired` / `remedyCommand: grok` should you tell your user to
   open the Grok CLI once; Pi-only expiry has no Grok remedy because Grok cannot refresh Pi-owned
   credentials. Do not treat soft expiry as full sign-out, and do not ask quota-axi to refresh
   credentials - it never launches Grok or Pi or writes auth files. `authStatus: usable` with
   empty windows means model auth is present (Grok CLI and/or Pi `xai`) while consumer credit
   windows are unknown - not logged out. Reserve true sign-in recovery for
   `authStatus: unusable` / `Grok sign-in required`.
8. For a managed Codex installation, set `QUOTA_AXI_CODEX_BINARY` to its absolute executable
   path. quota-axi uses that exact executable for auth inspection and the read-only app-server
   fallback, and fails closed if the override is invalid. Codex OAuth availability follows the
   access token, not id_token expiry alone.
9. For Kimi, quota-axi prefers a literal Pi-managed `kimi-coding` API key from
   `$PI_CODING_AGENT_DIR/auth.json` (default `~/.pi/agent/auth.json`). If it is
   unavailable, quota-axi may reuse a fresh official Kimi Code CLI access token from
   `$KIMI_CODE_HOME/credentials/kimi-code.json` (default
   `$HOME/.kimi-code/credentials/kimi-code.json`) without refreshing or writing credentials.
   Grok also reads that same Pi auth file for an independent `xai` OAuth or literal API-key
   entry and treats Grok as usable when either the Grok CLI session or Pi `xai` credential is
   valid.

## Usage

```
usage: quota-axi [quota|auth|models] [flags]
commands[3]:
  (none)=quota, auth, models
output:
  Default TOON reports local quota evidence. models is a deterministic data join; --sort runway is explicit opt-in ordering. --tui renders a live human terminal report instead (q quits).
flags[11]:
  --provider <claude,codex,cursor,copilot,grok,kimi,opencode,commandcode,zai,openrouter,phoenixgrove>, --json, --full, --tui, --refresh <30s-24h>, --once, --allow-keychain-prompt, --intelligence <high|medium|low>, --sort <runway>, --help, -v/--version
examples:
  quota-axi
  quota-axi --provider claude
  quota-axi --provider cursor,copilot,grok,kimi
  quota-axi --provider opencode,commandcode,zai,openrouter,phoenixgrove
  quota-axi --json
  quota-axi --full
  quota-axi --tui
  quota-axi --tui --refresh 1m
  quota-axi --tui --once
  quota-axi auth
  quota-axi models --intelligence high
  quota-axi models --sort runway
```

## Aggregate-plan providers: OpenCode Go, Command Code, Z.AI

Three providers meter the same monthly/rolling windows the coding-agent CLIs
show. They authenticate with a single literal API key and call first-party
usage endpoints; quota-axi never launches the OpenCode, Command Code, or Pi
CLIs and never imports browser cookies.

- **OpenCode Go** (`opencode`) — `GET https://opencode.ai/zen/go/v1/usage`
  with `Authorization: Bearer <key>` returns `usage.rolling|weekly|monthly`
  windows (each `{percent, resetsAt}`); opencode also exposes available models
  via `GET https://opencode.ai/zen/v1/models`. The Go usage endpoint is
  community-verified but not part of the official documented API
  (anomalyco/opencode#10448), so the parser tolerates bare and `usage.*`
  window keys and both `resetsAt` and `resetsInSeconds`. Key sources, in
  order: `~/.local/share/opencode/auth.json` (`opencode`/`opencode-go`
  entries), then Pi's `~/.pi/agent/auth.json` `opencode` entry.
- **Command Code** (`commandcode`) — the live meters, caps, and reset times
  come from the same `/alpha/*` surface the CLI's `/usage` view uses, all
  Bearer-authenticated with the same key: `GET /alpha/whoami` (org id —
  optional; personal accounts report `org:null`), `GET
  /alpha/billing/credits` (`windowLimits.fiveHour|weekly` with `used`/`cap`/
  `resetAt` unix-ms), `GET /alpha/billing/subscriptions`
  (`planId`/`currentPeriodStart|End`), and `GET /alpha/usage/summary`
  (`totalMonthlyCredits`). The monthly window is the plan's documented monthly
  pool (Go $10, GOAT $70, Pro $80, Max 10× $150, Max 20× $300); an unknown plan
  id reports the monthly window without a fabricated percentage. Key sources,
  in order: `COMMAND_CODE_API_KEY`, `~/.config/opencode/.command-code.key`,
  then Pi's `~/.pi/agent/models.json` `providers.commandcode.apiKey` (env-var
  references are never resolved, so a `$COMMAND_CODE_API_KEY` ref reads as
  missing).
- **Z.AI GLM Coding Plan** (`zai`) — `GET https://api.z.ai/api/monitor/usage/
  quota/limit` (CN: `open.bigmodel.cn`) with the coding-plan API key returns
  the plan `level` and a `limits` array. `TOKENS_LIMIT`/`CREDIT_LIMIT` rows
  carry the window via `unit`/`number` (unit 3 + number 5 = 5-hour; unit 6 +
  number 1 = weekly); `TIME_LIMIT` rows are the monthly MCP-tool budget;
  `RATE_LIMIT` and other rows are informational and never bound plan
  availability. Key sources, in order: `ZAI_API_KEY`, `BIGMODEL_API_KEY`, then
  Pi's `~/.pi/agent/auth.json` `zai`/`zhipu`/`glm` entry.

None of the three participate in the `models` evidence join (they route many
underlying models rather than owning a native model catalog); `quota-axi models`
rejects them.

## Prepaid balance provider: OpenRouter

- **OpenRouter** (`openrouter`) — `GET https://openrouter.ai/api/v1/key` with
  `Authorization: Bearer <key>` reports the key's spend cap (`limit`),
  remaining balance (`limit_remaining`), lifetime spend (`usage`), and
  daily/weekly/monthly spend diagnostics. A spend cap is a prepaid pool, not a
  rolling window, so it surfaces as a single `credits`-kind balance window with
  a reset only when `limit_reset` is actually set. Key sources, in order:
  `OPENROUTER_API_KEY`, `~/.local/share/opencode/auth.json` (`openrouter`
  entry), then Pi's `~/.pi/agent/auth.json` `openrouter` entry.

## Prepaid/credit plan provider: Phoenix Grove Systems

- **Phoenix Grove** (`phoenixgrove`) — `GET https://api.pgsgrove.com/v1/usage`
  with `Authorization: Bearer pgsk_...` is the key-authenticated usage read
  (the server's own unauthenticated 404 route listing names `GET /models,
  /usage` under `/v1`). The 200 body shape is undocumented (no `/docs/usage`
  page, no OpenAPI spec), so the parser tolerates `percent`/`percentage`/
  `usedPercent` gauges, `used`/`cap` pairs, `resetsAt`/`resetsInSeconds`
  resets, and the subscription usage-bank (`bank`/`banked`) fields; an
  unrecognized body reports unavailable rather than a fabricated window. Key
  sources, in order: `PHOENIXGROVE_API_KEY`, `PGS_API_KEY`, then
  `~/.config/opencode/.phoenixgrove-key`.

## OpenCode Zen (pay-as-you-go / big-pickle): not covered

Zen exposes no API-key-authenticated usage or balance endpoint (tracked as
anomalyco/opencode#10448); console billing is browser-session only. The
`opencode` provider's Go-plan windows are the closest key-authenticated bound
on the same account. Do not add cookie-scraping; revisit if zen ships a
key-authenticated usage API.

## Tips

- Output is TOON-encoded and token-efficient by default; pass `--json` only when you need
  the normalized schema.
- Exit code 0 means at least one provider returned data (fresh or stale); exit code 1 means
  every provider failed; exit code 2 means a usage error.
- Percentages are not comparable across providers - quota-axi never claims one provider's
  percentage equals another's.
- Claude `--full` output exposes the authoritative OAuth profile `account.uuid` as
  `account.accountId` when Anthropic returns one; otherwise the account identity is explicitly
  marked unverified rather than inferred.
- The quota cache at `~/.cache/quota-axi/quotas.json` only ever holds normalized
  non-secret snapshots.
  Fresh provider reports with no windows clear stale provider snapshots instead of caching
  empty quota.
  Claude local expiry metadata is advisory when an access token exists: the existing read-only
  usage request decides validity. Missing or invalid credentials without a usable token and HTTP
  401/403 retire Claude cache; only transient failures may use bounded, reset-pruned stale data.
  Claude and Cursor CLI Keychain access markers live alongside it, use hashed account scope,
  and contain no credential values or raw account identity. The Claude marker is also
  profile-scoped.
