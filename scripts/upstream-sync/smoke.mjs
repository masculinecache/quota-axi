#!/usr/bin/env node
/**
 * Live endpoint smoke checks for the providers this fork alone offers
 * (opencode, opencode-go, commandcode, zai, openrouter, phoenixgrove).
 *
 * One cheap authenticated call per provider, reading each key from its
 * provider-named environment variable (GitHub Actions secret names):
 *
 *   OPENCODE_API_KEY       -> GET https://opencode.ai/zen/go/v1/usage
 *   OPENCODE_GO_API_KEY    -> GET https://opencode.ai/zen/go/v1/usage
 *   COMMAND_CODE_API_KEY   -> GET https://api.commandcode.ai/alpha/whoami
 *   ZAI_API_KEY            -> GET https://api.z.ai/api/monitor/usage/quota/limit
 *                               (falls back to open.bigmodel.cn like the provider)
 *   OPENROUTER_API_KEY     -> GET https://openrouter.ai/api/v1/key
 *   PHOENIXGROVE_API_KEY   -> GET https://api.pgsgrove.com/v1/usage
 *
 * Contract: an absent or empty secret is a visible SKIP, never a failure and
 * never a block on the other providers. A set secret that cannot complete its
 * check (non-2xx, network error, unparseable body, or — for phoenixgrove — a
 * 200 body without parseable percentage fields) is a FAIL.
 *
 * Secret values are never printed; output carries statuses, counts, and field
 * names only.
 *
 * Usage: node scripts/upstream-sync/smoke.mjs [--summary-file PATH]
 * Exit code: 0 when no check failed (SKIPs excluded), 1 otherwise.
 */

import { writeFileSync } from "node:fs";

const TIMEOUT_MS = 15_000;

const CHECKS = [
  {
    provider: "opencode",
    secret: "OPENCODE_API_KEY",
    url: "https://opencode.ai/zen/go/v1/usage",
    auth: (key) => `Bearer ${key}`,
    validate: (body) => {
      const root = objectValue(body);
      const usage = objectValue(root?.usage);
      if (!usage) return fail("2xx body has no usage object");
      return { detail: `usage keys: ${Object.keys(usage).join(", ") || "(empty)"}` };
    },
  },
  {
    provider: "opencode-go",
    secret: "OPENCODE_GO_API_KEY",
    url: "https://opencode.ai/zen/go/v1/usage",
    auth: (key) => `Bearer ${key}`,
    validate: (body) => {
      const root = objectValue(body);
      const usage = objectValue(root?.usage);
      if (!usage) return fail("2xx body has no usage object");
      return { detail: `usage keys: ${Object.keys(usage).join(", ") || "(empty)"}` };
    },
  },
  {
    provider: "commandcode",
    secret: "COMMAND_CODE_API_KEY",
    url: "https://api.commandcode.ai/alpha/whoami",
    auth: (key) => `Bearer ${key}`,
    validate: (body) => {
      const root = objectValue(body);
      if (!root) return fail("2xx body is not a JSON object");
      const user = objectValue(root.user) ? "present" : "missing";
      const org = objectValue(root.org) ? "present" : "missing";
      return { detail: `user ${user}, org ${org}` };
    },
  },
  {
    provider: "zai",
    secret: "ZAI_API_KEY",
    // Mirrors the fork's zai adapter: international endpoint first, CN mirror
    // as fallback for keys homed on open.bigmodel.cn.
    urls: [
      "https://api.z.ai/api/monitor/usage/quota/limit",
      "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
    ],
    auth: (key) => key,
    validate: (body) => {
      const root = objectValue(body);
      const data = objectValue(root?.data) ?? root;
      const limits = Array.isArray(data?.limits) ? data.limits : undefined;
      if (!limits) return fail("2xx body has no data.limits array");
      return { detail: `limits: ${limits.length}` };
    },
  },
  {
    provider: "openrouter",
    secret: "OPENROUTER_API_KEY",
    url: "https://openrouter.ai/api/v1/key",
    auth: (key) => `Bearer ${key}`,
    validate: (body) => {
      const root = objectValue(body);
      const data = objectValue(root?.data) ?? root;
      if (!data) return fail("2xx body has no data object");
      const fields = ["limit", "limit_remaining", "usage"].filter(
        (field) => field in data,
      );
      return { detail: `balance fields: ${fields.join(", ") || "(none)"}` };
    },
  },
  {
    provider: "phoenixgrove",
    secret: "PHOENIXGROVE_API_KEY",
    url: "https://api.pgsgrove.com/v1/usage",
    auth: (key) => `Bearer ${key}`,
    validate: (body) => {
      // PGS /v1/usage answers 200 with weekly/daily percentage gauges (plus
      // reset times) for plan keys; assert the percentages are parseable
      // rather than the old usage-denied verdict.
      const root = objectValue(body);
      if (!root) return fail("2xx body is not a JSON object");
      const percentPaths = [];
      const resetPaths = [];
      scan(root, [], percentPaths, resetPaths);
      if (percentPaths.length === 0) {
        return fail(
          `200 body has no parseable percentage fields (top-level keys: ${Object.keys(root).join(", ") || "(empty)"})`,
        );
      }
      return {
        detail: `percent fields: ${percentPaths.slice(0, 4).join(", ")}${resetPaths.length > 0 ? `; reset fields: ${resetPaths.slice(0, 2).join(", ")}` : ""}`,
      };
    },
  },
];

const results = [];
for (const check of CHECKS) {
  const key = process.env[check.secret]?.trim();
  if (!key) {
    results.push({
      provider: check.provider,
      outcome: "SKIP",
      detail: `secret ${check.secret} not set`,
    });
    continue;
  }
  results.push(await runCheck(check, key));
}

for (const result of results) {
  console.log(`${result.outcome} ${result.provider} ${result.detail}`);
}
const counts = { PASS: 0, SKIP: 0, FAIL: 0 };
for (const result of results) counts[result.outcome] += 1;
console.log(
  `summary: pass=${counts.PASS} skip=${counts.SKIP} fail=${counts.FAIL}`,
);

const summaryIndex = process.argv.indexOf("--summary-file");
if (summaryIndex !== -1 && process.argv[summaryIndex + 1]) {
  writeFileSync(
    process.argv[summaryIndex + 1],
    markdownSummary(results, counts),
  );
}

process.exit(counts.FAIL > 0 ? 1 : 0);

async function runCheck(check, key) {
  const urls = check.urls ?? [check.url];
  let last;
  for (const url of urls) {
    last = await request(check, key, url);
    // Only the zai-style explicit fallback list retries after an auth
    // rejection; anything else (including PASS) returns immediately.
    if (!check.urls || last.outcome !== "FAIL" || !/rejected/.test(last.detail)) {
      return last;
    }
  }
  return last;
}

async function request(check, key, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        authorization: check.auth(key),
        accept: "application/json",
      },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return {
        provider: check.provider,
        outcome: "FAIL",
        detail: `HTTP ${response.status}: key rejected`,
      };
    }
    if (!response.ok) {
      return {
        provider: check.provider,
        outcome: "FAIL",
        detail: `HTTP ${response.status} from ${shortUrl(url)}`,
      };
    }
    let body;
    try {
      body = await response.json();
    } catch {
      return {
        provider: check.provider,
        outcome: "FAIL",
        detail: `HTTP 200 body is not JSON (${shortUrl(url)})`,
      };
    }
    const verdict = check.validate(body);
    return {
      provider: check.provider,
      outcome: verdict.failed ? "FAIL" : "PASS",
      detail: verdict.failed
        ? verdict.error
        : `200 ${shortUrl(url)} (${verdict.detail})`,
    };
  } catch (error) {
    return {
      provider: check.provider,
      outcome: "FAIL",
      detail:
        error instanceof Error && error.name === "AbortError"
          ? `request timed out after ${TIMEOUT_MS}ms`
          : `network error: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function scan(value, path, percentPaths, resetPaths) {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (typeof child === "number" && Number.isFinite(child)) {
      if (/percent/i.test(key)) percentPaths.push(childPath.join("."));
      if (/reset/i.test(key)) resetPaths.push(childPath.join("."));
    }
    scan(child, childPath, percentPaths, resetPaths);
  }
}

function objectValue(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function shortUrl(url) {
  return url.replace(/^https:\/\//, "");
}

function fail(error) {
  return { failed: true, error };
}

function markdownSummary(results, counts) {
  const rows = results
    .map(
      (result) =>
        `| ${result.outcome} | ${result.provider} | ${result.detail} |`,
    )
    .join("\n");
  const verdict =
    counts.FAIL > 0
      ? "**RED** — failing smoke check(s); PR stays open"
      : `**GREEN** — ${counts.PASS} pass, ${counts.SKIP} skip (skips excluded from the gate)`;
  return `### Provider smoke checks\n\n| outcome | provider | detail |\n| --- | --- | --- |\n${rows}\n\n${verdict}\n`;
}
