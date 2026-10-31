# Development Guide

> The repository does not contain application code yet. Commands and library names below are the **proposed** conventions for an Electron + Next.js (TypeScript) project and must be adjusted once the project is scaffolded. Read [REQUIREMENTS.md](REQUIREMENTS.md) and [DESIGN.md](DESIGN.md) first.

## 1. Prerequisites (developer machine only)

- **Windows 10/11 64-bit** for packaging and installer work (macOS/Linux are fine for pure UI and service development).
- **Node.js LTS**, pinned in `.nvmrc` / `package.json` `engines`. Use the exact versions in `package-lock.json` (**do not change versions silently**).
- Git.
- C++ build tools for Windows (Visual Studio Build Tools) only if a native module has no prebuilt binary for your Node/Electron version.
- A clean Windows VM for installer tests.

End users need none of these; Node.js is bundled inside the application.

## 2. Setup

```bash
git clone <repository-url> gym-management
cd gym-management
npm ci                      # install exact locked dependencies
npm run db:migrate          # create/upgrade the development SQLite database
npm run db:seed             # roles, permissions, default expense categories, starter plan templates
npm run dev                 # Next.js dev server (browser, for quick UI work)
npm run dev:electron        # Electron window loading the dev server
```

Seeds must **not** create a default production password. In development use `npm run dev:owner` (development only) to create a throwaway owner account.

### Proposed scripts

| Script | Purpose |
|---|---|
| `dev`, `dev:electron` | Run in development |
| `typecheck`, `lint` | TypeScript (strict) and ESLint checks |
| `test` | Vitest unit and integration tests |
| `test:e2e` | Playwright tests against the packaged or dev Electron app |
| `db:generate`, `db:migrate`, `db:seed` | Schema migrations and seed data |
| `build` | Production build of Next.js (standalone output) |
| `package` | Build the Windows installer (see [PACKAGING.md](PACKAGING.md)) |

### Native module note (`better-sqlite3`)

`better-sqlite3` is a native module. A build made for **plain Node** (used by Vitest) is not binary-compatible with the **Electron** build (used by the app). Keep both workflows scripted (for example, a `rebuild:node` and a `rebuild:electron` step, or `electron-builder install-app-deps` for the Electron side) and document which one the current checkout is built for. A "module was compiled against a different Node.js version" error means the wrong build is installed.

## 3. Project structure

```text
gym-management/
├── src/
│   ├── app/            # Next.js App Router: pages, layouts, route handlers, server actions
│   ├── components/     # React UI components
│   ├── server/
│   │   ├── policies/   # all permission rules
│   │   ├── services/   # business workflows, each in one DB transaction
│   │   ├── db/         # schema, typed queries
│   │   └── jobs/       # idempotent scheduled work
│   └── lib/            # money, dates, validation schemas, shared types
├── db/                 # migrations, seed data
├── electron/           # main process, preload, lifecycle manager, security config
├── tests/              # unit, integration, e2e
├── build/              # installer config, icons
├── scripts/            # build, package, diagnostics, backup utilities
└── docs/
```

## 4. Coding conventions

### General
1. **TypeScript strict mode.** No `any` in business logic; shared types live in `src/lib`.
2. **Money:** integer minor units (paisa) with a dedicated `Money` helper. Never floating-point arithmetic on currency.
3. **Validation:** every route handler and server action validates input with Zod before use. Server actions are public HTTP endpoints, so each one validates **and** authorizes.
4. **Services for workflows:** membership sale, payment, allocation, refund/reversal, check-in, cash closing, backup, restore live in `src/server/services`, each wrapped in a single transaction. `better-sqlite3` transactions are synchronous: keep them short and never `await` inside.
5. **Authorization:** every route handler and server action calls a policy. Do not rely on hidden buttons or on Next.js middleware alone.
6. **No hard deletes** of members, payments, charges, attendance, or audit rows. Use archive, void, or reversal.
7. **Idempotency:** form submissions that create money or memberships carry a one-time token with a unique constraint.
8. **Dates:** membership dates are date-only (`YYYY-MM-DD`); timestamps are stored in a canonical form and shown in the gym's timezone. Follow the date policy in DESIGN.md section B5. Use one well-maintained date library consistently.
9. **No hard-coded** currency, plan durations, or receipt formats.
10. **Secrets** never in source control or logs; never log passwords, tokens, or unneeded personal data.
11. **Migrations:** every schema change is a migration with a tested upgrade path from the previous release's database.
12. Prefer boring, well-maintained dependencies. Before adding one, check maintenance, license, Windows and Electron compatibility, and security advisories, and record it in the dependency inventory.

### Next.js specifics
- Use the **Node.js runtime** only (no Edge runtime). Mark server-only modules with the `server-only` package so they cannot be bundled into client components.
- Nothing may be fetched from the internet at build or run time: use `next/font/local` (no Google Fonts), bundled icons, no remote images, no analytics. Set `NEXT_TELEMETRY_DISABLED=1`.
- Build with `output: "standalone"`; verify the standalone server runs from the packaged location.
- Do not read user data from the program directory; use the data-directory path passed in by Electron.

### Electron specifics
- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and a strict CSP. Never relax them to make something work.
- Expose the minimum through the preload script; validate every IPC message in the main process.
- Block navigation away from the app origin and block new windows. No remote content.
- Keep the main process free of business logic.

## 5. Testing

```bash
npm run typecheck
npm run lint
npm test                  # Vitest: services, policies, lib
npm run test:e2e          # Playwright (Electron)
```

- **Unit/integration tests** run services against a temporary SQLite file created per test run (not mocks), so transaction, constraint, and migration behavior is real.
- **End-to-end tests** use Playwright's Electron support to drive the real app window.

Must be covered by automated tests before release:

- **Dates:** inclusive end dates, month-end clamping, leap years, freeze/extension math.
- **Ledger:** partial payments, allocation across charges, refunds, reversals, balance derivation, no double application.
- **Receipts:** unique numbering under concurrent requests.
- **Check-in:** allow/deny matrix, duplicate window, override with audit.
- **Authorization:** each role against each route and server action (table-driven), including a request that lacks the launch token.
- **Backup:** create, verify checksum, reject a corrupt file, restore round-trip.
- **Migrations:** fresh database and previous-release database.
- **Exports:** UTF-8 correctness and formula-injection escaping.

Report results honestly, including failures and skipped tests.

## 6. Local data during development

Development and test use separate database files in a local `.data/` folder (git-ignored). Packaged builds use `%LOCALAPPDATA%\GymManagementSystem`. Never point a development run at a real gym's data directory.

## 7. Git workflow

- Branches: `main` (releasable), `feature/<short-name>`, `fix/<short-name>`.
- Releases are tagged `vMAJOR.MINOR.PATCH` and built only from a tag.
- Update `CHANGELOG.md` in the same change as any user-visible behavior.

## 8. Debugging and logs

- Development: terminal output of Next.js and Electron, plus DevTools in dev builds only (DevTools and remote debugging are disabled in production).
- Packaged logs: `%LOCALAPPDATA%\GymManagementSystem\logs` (rotated; no passwords or tokens).
- The diagnostics page shows version, database status, disk space, last backup, and can recompute ledger balances to detect inconsistencies.

## 9. Definition of done for a change

- [ ] Code, migration, and tests included and passing (`typecheck`, `lint`, `test`).
- [ ] Authorization and audit behavior covered where relevant.
- [ ] Electron security settings unchanged (or change explicitly approved).
- [ ] Security and data-integrity review done.
- [ ] Affected workflow exercised manually.
- [ ] Documentation and changelog updated.
- [ ] Pull request lists files changed, tests run, and remaining issues.
