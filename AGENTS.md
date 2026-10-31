# AGENTS.md

## What this is

Offline Windows desktop gym management app. **Not a website**: Electron (`electron/`) is the shell; it forks the Next.js 16 standalone server as a `utilityProcess` bound to `127.0.0.1` with a per-launch token. SQLite via `better-sqlite3`. Ships as an NSIS `.exe`. Nothing may be fetched from the internet at build or run time (local fonts, no remote images; `NEXT_TELEMETRY_DISABLED=1` is set by the scripts).

Node is pinned to **22.23.x** (`.nvmrc` 22.23.2, `engines: >=22.23.0 <23`). Do not change dependency versions silently — `package-lock.json` is the contract.

## Commands

```bash
npm run typecheck        # tsc --noEmit (covers src, electron, tests, scripts/db-migrate.ts)
npm run lint             # eslint .
npm test                 # vitest run
npx vitest run tests/<file>.test.ts   # single test file
npm run dev              # Next dev server, 127.0.0.1:3000
npm run dev:electron     # second terminal: builds electron TS, opens window on the dev server (GMS_DEV=1)
npm run package          # full ordered packaging chain — see below
```

Verify with `typecheck -> lint -> test` before claiming a change works. There is **no CI** and no pre-commit hook — this loop is the only gate.

`npm run package` order matters and must not be skipped or reordered: `next build` (standalone output) → `tsc -p tsconfig.electron.json` (CommonJS into `dist-electron/`; `package.json` `main` points there, so `electron .` requires it) → `scripts/prepare-standalone.mjs` → `electron-builder --win nsis` → checksums. `prepare-standalone.mjs` copies `static/`, `public/`, and `db/migrations` into `.next/standalone` and replaces `better-sqlite3` there — without it the packaged app has no migrations and/or the wrong native binary. `electron-builder.yml` sets `npmRebuild: false` **deliberately**; the native rebuild is orchestrated by the script chain.

## better-sqlite3 ABI trap

`better-sqlite3` is native and built for **either** plain Node (what vitest uses) **or** Electron (what the packaged app uses) — never both at once:

- `npm run rebuild:node` — for vitest
- `npm run rebuild:electron` — for `dev:electron` / packaging

After rebuilding for one side, the other fails with "module was compiled against a different Node.js version". Don't debug that as an app bug.

## Database and migrations

- Migrations are numbered SQL files in `db/migrations/`, applied in filename order, tracked **by filename** in `schema_migrations` — there are **no checksums**, so editing an already-applied file does nothing. Always add a new numbered file.
- Migrations **auto-run at server boot** via `src/instrumentation.ts` (dev and packaged alike; fails closed on error). `GMS_SKIP_MIGRATIONS=1` opts out. `npm run db:migrate` is the manual equivalent. A pre-migration online backup is taken automatically when upgrading an existing DB.
- `migrationsDir()` resolves relative to `process.cwd()` (packaged cwd = `resources/app`) — this is why migrations ship as `extraResources`.
- Dev/test data lives in `.data/` under the repo (git-ignored). Production requires `GMS_DATA_DIR` (Electron sets it to `%LOCALAPPDATA%\GymManagementSystem`) and **throws if unset**. Never point a dev run at real gym data.
- `npm run db:seed` is currently a stub; migrations seed the settings rows.

## Testing quirks

- `vitest.config.mts` sets `fileParallelism: false` **on purpose** — tests manipulate shared `process.env` (launch-token mode). Don't re-enable parallelism.
- `server-only` is aliased to `tests/helpers/server-only-stub.ts` so tests can import `src/server/**` modules directly. Keep the alias.
- Tests use **real SQLite**: `tests/helpers/db.ts` `makeTestDb()` creates a temp DB with the real migrations applied. Don't introduce mocks of the DB layer.
- Path alias `@/*` → `src/*` works in tsconfig and vitest.
- `tests/token.test.ts` and others depend on token-mode env state — a stray `GMS_LAUNCH_TOKEN` in your shell can change test behavior.

## Security invariants (never relax — issue a question instead)

- Request pipeline is `src/proxy.ts` (Next 16's **proxy**, not `middleware.ts`): launch-token gate first (`src/server/security/token.ts`), then session gate. Production without a token fails closed (503); dev/test without a token allows all so a plain browser works. `/api/health`, `/setup`, `/dev`, `/api/dev` are session-free **by design** (the Electron health probe has no session) — new routes under `/api/dev` would be unauthenticated apart from the token.
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP, navigation/new-window blocked, fuses in `electron-builder.yml` (incl. `runAsNode: false` — the backend uses `utilityProcess`, not `child_process.fork`).
- Authorization is server-side in `src/server/policies/` for every route handler and server action; hiding buttons is not a check. Server actions are public HTTP endpoints: validate (Zod) **and** authorize each one.
- Money rules (integer minor units, ledger-derived balances, immutable payments with audited reversals, no hard deletes, idempotency tokens, no `await` inside synchronous better-sqlite3 transactions) are the contract — see `AGENT_PROMPT.md` §4 and `docs/DEVELOPMENT.md` §4 for the full list. Tests in `tests/` enforce several of these; don't weaken them.

## Docs: what to trust

- `AGENT_PROMPT.md` is the canonical rule set (engineering invariants, phase order, honesty requirements). The phases are ordered; don't start optional modules (trainers, payroll, classes…) without approval. Current progress: Phase 0 packaged and evidenced (`docs/PHASE0_WINDOWS_EVIDENCE.md`), Phase 1 shipped, Phase 2 (members) in progress — check `docs/CHANGELOG.md` for the real state.
- **Stale docs**: `docs/README.md` and the `docs/DEVELOPMENT.md` intro still claim "nothing has been built yet" — wrong. `docs/DEVELOPMENT.md` also references `npm run dev:owner` and `npm run test:e2e`, which **do not exist** in `package.json`. Trust `package.json` and the code.
- There is no root `README.md`; `docs/README.md` fills that role. `docs/SECURITY.md`, `docs/PACKAGING.md`, and `docs/RELEASE_CHECKLIST.md` describe real constraints — read PACKAGING before touching the build chain.

## Conventions that differ from defaults

- ESLint: `@typescript-eslint/no-explicit-any` is an **error**; `no-console` is a warning (allowed in `electron/` and `scripts/` where it is off).
- Business logic lives in `src/server/**`, must not import Next.js or Electron modules, and server-only modules carry `import "server-only"`.
- Update `docs/CHANGELOG.md` in the same change as any user-visible behavior.
- `test-electron.js` at the repo root is a one-off probe script for the Electron ABI, not part of the test suite.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
