# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## This fork ships compiled JS as the source of truth

The masculinecache fork tracks `dist/` only — there is no `src/`, so `pnpm test` (which runs `tsc`) and `pnpm lint` cannot work. Edit `dist/src/**/*.js` directly, register new providers in `dist/src/providers/index.js` + `dist/src/types.js` (`PROVIDER_IDS`), and verify with `node --test tests/*.test.mjs` plus `node dist/bin/quota-axi.js --provider <id>`. Keep `dist/src/types.d.ts` in sync with `types.js`. `package.json` `version` must stay a clean `X.Y.Z` (fleet gate `FM_QUOTA_AXI_MIN` rejects `-dev` suffixes).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
