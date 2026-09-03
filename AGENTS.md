# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## This fork ships compiled JS as the source of truth

The masculinecache fork tracks `dist/` only — there is no `src/`, so `pnpm test` (which runs `tsc`) and `pnpm lint` cannot work. Edit `dist/src/**/*.js` directly, register new providers in `dist/src/providers/index.js` + `dist/src/types.js` (`PROVIDER_IDS`), and verify with `node --test tests/*.test.mjs` plus `node dist/bin/quota-axi.js --provider <id>`. Keep `dist/src/types.d.ts` in sync with `types.js`. `package.json` `version` must stay a clean `X.Y.Z` (fleet gate `FM_QUOTA_AXI_MIN` rejects `-dev` suffixes).

## Upstream sync

`.github/workflows/upstream-sync.yml` (daily cron + `workflow_dispatch`) keeps the repo current with upstream `kunchenguid/quota-axi` (default branch `main`): it no-ops silently when the upstream HEAD matches `.github/upstream-sync-state.json`; otherwise it merges `upstream/main` into `sync/upstream` (`-X ours`, unrelated histories on the first sync), pins fork-owned files (README, package.json, .gitignore, AGENTS.md, CLAUDE.md, LICENSE, skills) to their HEAD state, prunes upstream's CI/no-mistakes/release-please machinery, then gates on the node test suite plus one cheap authenticated live check per fork-only provider (opencode, opencode-go, commandcode, zai, openrouter, phoenixgrove). All green (SKIPs excluded) squash-merges the sync PR to master; any red leaves the PR open with the failure posted to its body. The committed `dist/` stays the fork's hand-maintained build — the workflow validates, it does not rebuild dist or bump the version. Smoke keys are GitHub Actions secrets referenced by NAME only (`OPENCODE_API_KEY`, `OPENCODE_GO_API_KEY`, `COMMAND_CODE_API_KEY`, `ZAI_API_KEY`, `OPENROUTER_API_KEY`, `PHOENIXGROVE_API_KEY`); never print or commit their values. Upstream attribution (kunchenguid) lives in the README fork notice and `package.json`.

## GitHub credential rule (captain order 2026-09-02)

All GitHub operations on this repo use the masculinecache account only — never the global phillias credentials or any ambient config. Every `gh`/`gh-axi` call exports `GH_CONFIG_DIR=$HOME/.config/gh-masculinecache` first and runs from the worktree directory; the committed `.mise.toml` pin (`GH_REPO` + `GH_CONFIG_DIR`) already carries both into every shell the fleet's mise layer opens inside the repo, so a bare `gh` on ambient config is a misconfiguration, not a fallback. `git push` resolves to masculinecache via the repo-local credential helper: verify the blank-reset chain with `git config --get-all credential.https://github.com.helper` — an empty blank-reset line must precede the masculinecache `gh auth git-credential` helper as the last entry — and never alter it. On any auth failure: stop and report blocked; never retry with different credentials.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file, command, or doc instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
