import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGoUsage } from "../dist/src/providers/opencode.js";
import { normalizeCommandCodeQuota } from "../dist/src/providers/commandcode.js";
import { normalizeZaiQuota } from "../dist/src/providers/zai.js";

test("opencode: maps usage.rolling/weekly/monthly into real windows (live shape)", () => {
  const raw = {
    usage: {
      rolling: { status: "ok", percent: 0, resetsAt: "2026-08-28T07:25:58.921Z" },
      weekly: { status: "ok", percent: 0, resetsAt: "2026-08-31T00:00:00.921Z" },
      monthly: { status: "rate-limited", percent: 100, resetsAt: "2026-08-31T21:14:27.921Z" },
    },
  };
  const quota = normalizeGoUsage(raw);
  assert.ok(quota);
  assert.equal(quota.windows.length, 3);
  const byId = Object.fromEntries(quota.windows.map((w) => [w.id, w]));
  assert.equal(byId.five_hour.percentUsed, 0);
  assert.equal(byId.five_hour.windowSeconds, 18_000);
  assert.equal(byId.weekly.percentUsed, 0);
  assert.equal(byId.weekly.windowSeconds, 604_800);
  assert.equal(byId.monthly.percentUsed, 100);
  assert.equal(byId.monthly.resetsAt, "2026-08-31T21:14:27.921Z");
});

test("opencode: tolerates 0-percent windows and numeric reset ms won't mis-date", () => {
  const quota = normalizeGoUsage({
    usage: {
      rolling: { percent: 0, resetsAt: "2026-08-28T07:00:00.000Z" },
    },
  });
  assert.ok(quota);
  assert.equal(quota.windows[0].percentUsed, 0);
  assert.equal(quota.windows[0].percentRemaining, 100);
});

test("commandcode: personal account (org:null) still yields live windows (live shape)", () => {
  const quota = normalizeCommandCodeQuota(
    { success: true, user: { id: "u1", email: "p@g.com", userName: "p" }, org: null },
    {
      credits: { monthlyCredits: 0, purchasedCredits: 0, freeCredits: 0 },
      windowLimits: {
        fiveHour: { used: 11.07, cap: 14, exceeded: false, resetAt: 1787885280580 },
        weekly: { used: 34.978125388, cap: 35, exceeded: false, resetAt: 1788282603136 },
      },
    },
    {
      success: true,
      data: {
        planId: "individual-goat",
        userId: "u1",
        currentPeriodStart: "2026-08-12T22:33:40.000Z",
        currentPeriodEnd: "2026-09-12T22:33:40.000Z",
      },
    },
    { totalMonthlyCredits: 70.09, totalCost: 70.09, totalCount: 1587 },
  );
  assert.ok(quota);
  assert.equal(quota.plan, "individual-goat");
  const byId = Object.fromEntries(quota.windows.map((w) => [w.id, w]));
  assert.equal(byId.five_hour.percentUsed, 79);
  assert.equal(byId.five_hour.resetsAt, new Date(1787885280580).toISOString());
  assert.equal(byId.weekly.percentUsed, 100);
  assert.equal(byId.monthly.percentUsed, 100);
  assert.equal(byId.monthly.limitUsd, 70);
  assert.equal(quota.account.email, "p@g.com");
  assert.equal(quota.account.accountId, "u1");
  assert.deepEqual(quota.credits, { remaining: 70, unit: "usd" });
});

test("commandcode: unix-ms reset never mis-dates as seconds", () => {
  const quota = normalizeCommandCodeQuota(
    { org: null },
    { windowLimits: { fiveHour: { used: 1, cap: 14, resetAt: 1787885280580 } } },
    { data: { planId: "individual-goat" } },
  );
  const fiveHour = quota.windows.find((w) => w.id === "five_hour");
  assert.ok(fiveHour.resetsAt);
  assert.match(fiveHour.resetsAt, /^2026-/);
});

test("zai: TOKENS_LIMIT unit/number maps 5h and weekly; TIME_LIMIT is monthly (live shape)", () => {
  const quota = normalizeZaiQuota({
    data: {
      level: "lite",
      limits: [
        { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 42, nextResetTime: 1787885280580 },
        { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 18, nextResetTime: 1787885280580 },
        { type: "TIME_LIMIT", percentage: 7, nextResetTime: 1787885280580 },
        { type: "RATE_LIMIT", percentage: 0, nextResetTime: 1787885280580 },
      ],
    },
  });
  assert.ok(quota);
  assert.equal(quota.plan, "Lite");
  const byId = Object.fromEntries(quota.windows.map((w) => [w.id, w]));
  assert.equal(byId.five_hour.percentUsed, 42);
  assert.equal(byId.weekly.percentUsed, 18);
  assert.equal(byId.monthly.percentUsed, 7);
  // RATE_LIMIT is informational and does not bound plan availability.
  assert.equal(byId["limit:rate_limit"].kind, "unknown");
});

test("zai: CREDIT_LIMIT alias (newer plans) maps the same window shapes", () => {
  const quota = normalizeZaiQuota({
    data: {
      limits: [
        { type: "CREDIT_LIMIT", unit: 3, number: 5, percentage: 10 },
        { type: "CREDIT_LIMIT", unit: 6, number: 1, percentage: 20 },
      ],
    },
  });
  assert.ok(quota);
  const byId = Object.fromEntries(quota.windows.map((w) => [w.id, w]));
  assert.equal(byId.five_hour.percentUsed, 10);
  assert.equal(byId.weekly.percentUsed, 20);
});

test("openrouter: maps spend cap to a credits balance window (live shape)", async () => {
  const { normalizeKeyBalance } = await import("../dist/src/providers/openrouter.js");
  const quota = normalizeKeyBalance({
    data: {
      label: "sk-or-v1-7a5...2ac",
      is_free_tier: false,
      limit: 20,
      limit_reset: null,
      limit_remaining: 0,
      usage: 20.01725153,
      usage_daily: 10.146310684,
      usage_weekly: 13.893427603,
      usage_monthly: 16.776014006,
    },
  });
  assert.ok(quota);
  assert.equal(quota.windows.length, 1);
  const w = quota.windows[0];
  assert.equal(w.id, "balance");
  assert.equal(w.kind, "credits");
  assert.equal(w.percentUsed, 100);
  assert.equal(w.limitUsd, 20);
  assert.deepEqual(quota.credits, { remaining: 0, unit: "usd" });
});

test("openrouter: uncapped key (limit null) reports no balance window, no crash", async () => {
  const { normalizeKeyBalance } = await import("../dist/src/providers/openrouter.js");
  const quota = normalizeKeyBalance({ data: { limit: null, limit_remaining: null, usage: 3.2 } });
  assert.equal(quota, undefined);
});

test("openrouter: partial balance derives remaining from limit minus usage", async () => {
  const { normalizeKeyBalance } = await import("../dist/src/providers/openrouter.js");
  const quota = normalizeKeyBalance({ data: { limit: 50, limit_remaining: 12.5, usage: 37.5 } });
  assert.ok(quota);
  assert.equal(quota.windows[0].percentRemaining, 25);
  assert.equal(quota.credits.remaining, 12.5);
});

test("phoenixgrove: percent gauge window with reset and tier (tolerated shape)", async () => {
  const { normalizeUsage } = await import("../dist/src/providers/phoenixgrove.js");
  const quota = normalizeUsage({
    data: {
      plan: "coding-pro",
      usage: { percent: 42.5, resetsAt: "2026-08-30T12:00:00.000Z" },
      bank: { percent: 10, resetsAt: "2026-09-06T00:00:00.000Z" },
      remaining: 575,
    },
  });
  assert.ok(quota);
  assert.equal(quota.plan, "coding-pro");
  assert.equal(quota.windows.length, 2);
  const byId = Object.fromEntries(quota.windows.map((w) => [w.id, w]));
  assert.equal(byId.five_hour.percentUsed, 43);
  assert.equal(byId.five_hour.percentRemaining, 57);
  assert.equal(byId.five_hour.windowSeconds, 18_000);
  assert.equal(byId.bank.kind, "credits");
  assert.deepEqual(quota.credits, { remaining: 575, unit: "credits" });
});

test("phoenixgrove: used/cap pair derives percentage", async () => {
  const { normalizeUsage } = await import("../dist/src/providers/phoenixgrove.js");
  const quota = normalizeUsage({
    windows: { fiveHour: { used: 3, cap: 4, resetsAt: 1788000000000 } },
  });
  assert.ok(quota);
  assert.equal(quota.windows[0].id, "five_hour");
  assert.equal(quota.windows[0].percentUsed, 75);
  assert.equal(quota.windows[0].resetsAt, new Date(1788000000000).toISOString());
});

test("phoenixgrove: unrecognized body yields no window (never a fake one)", async () => {
  const { normalizeUsage } = await import("../dist/src/providers/phoenixgrove.js");
  assert.equal(normalizeUsage({ object: "list", data: [] }), undefined);
  assert.equal(normalizeUsage(null), undefined);
  assert.equal(normalizeUsage({ foo: "bar" }), undefined);
});

test("phoenixgrove: usage 401 + chat probe 200 => key-valid-usage-denied, no fake windows", async () => {
  const { fetchQuota, KEY_VALID_USAGE_DENIED_ERROR } = await import("../dist/src/providers/phoenixgrove.js");
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/v1/usage")) {
      return { ok: false, status: 401, headers: new Headers() };
    }
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [] }) };
  };
  process.env.PHOENIXGROVE_API_KEY = "pgsk_test";
  try {
    const provider = await fetchQuota({});
    assert.equal(provider.state.error, KEY_VALID_USAGE_DENIED_ERROR);
    assert.match(provider.state.error, /key-valid-usage-denied/);
    assert.equal(provider.state.status, "unavailable");
    assert.equal(provider.state.authStatus, "valid");
    assert.equal(provider.windows.length, 0);
    assert.deepEqual(provider.source, "unavailable");
    const probe = calls.find((c) => String(c.url).endsWith("/v1/chat/completions"));
    assert.ok(probe, "chat probe issued");
    assert.equal(probe.init.method, "POST");
    const body = JSON.parse(probe.init.body);
    assert.equal(body.max_tokens, 1);
    assert.equal(probe.init.headers.authorization, "Bearer pgsk_test");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.PHOENIXGROVE_API_KEY;
  }
});

test("phoenixgrove: usage 401 + chat probe 401 => key rejected (unchanged path)", async () => {
  const { fetchQuota } = await import("../dist/src/providers/phoenixgrove.js");
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { ok: false, status: 401, headers: new Headers() };
  };
  process.env.PHOENIXGROVE_API_KEY = "pgsk_test";
  try {
    const provider = await fetchQuota({});
    assert.equal(provider.state.error, "Phoenix Grove key rejected");
    assert.equal(provider.state.status, "error");
    assert.equal(provider.state.authStatus, undefined);
    assert.equal(provider.windows.length, 0);
    assert.equal(calls.filter((u) => u.endsWith("/v1/chat/completions")).length, 1);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.PHOENIXGROVE_API_KEY;
  }
});
