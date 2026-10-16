# Dependency inventory — Phase 0–1

All packages are MIT-compatible unless noted. Versions are exact pins in
`package.json`. Maintenance notes recorded 2026-10-16 at install time.
**Phase 1 added no new runtime dependencies** — passwords use Node's
built-in `node:crypto` scrypt (stdlib, no package).

## Runtime (shipped with the app)

| Package | Version | License | Role | Notes |
| --- | --- | --- | --- | --- |
| next | 16.4.2 | MIT | App Router server + UI runtime | Current major; standalone output used for packaging |
| react | 19.3.1 | MIT | UI runtime | Matched to Next 16 requirement |
| react-dom | 19.3.1 | MIT | UI runtime | Matched to react |
| better-sqlite3 | 13.0.3 | MIT | Database engine (WAL, FK) | Native; rebuilt against Electron ABI before packaging |
| drizzle-orm | 0.45.4 | MIT | Schema/query layer | Installed in Phase 0; imported from Phase 1 |
| zod | 4.6.7 | MIT | Runtime validation | Used at API boundaries and later form parsing |
| server-only | 0.0.1 | MIT | Build-time guard against client import of server modules | |

## Dev / build (not shipped)

| Package | Version | License | Role | Notes |
| --- | --- | --- | --- | --- |
| electron | 44.8.0 | MIT | Desktop shell | Latest stable line |
| electron-builder | 26.15.3 | MIT | Installer (NSIS) + rebuild | Pulls app-builder-lib etc. |
| @electron/fuses | 2.1.3 | MIT | Runtime fuse config | For hardening (Phase 0 wiring pending) |
| typescript | 5.9.3 | Apache-2.0 | Type checker | Chose 5.x over TS 7 (tooling maturity) |
| tsx | 4.23.15 | MIT | TS runner for scripts | |
| cross-env | 10.1.0 | MIT | Cross-platform env vars in scripts | |
| vitest | 5.0.5 | MIT | Unit tests | Node environment; coverage via V8 built-in (no @vitest/coverage-v8 package) |
| eslint | 9.39.5 | MIT | Linter | **Deprecated** (npm notice); bump to 10.x tracked below |
| @eslint/js | 9.39.5 | MIT | ESLint base rules | Match eslint major |
| typescript-eslint | 8.71.2 | MIT | TS lint rules | Peer allows eslint ^10 |
| eslint-config-next | 16.4.2 | MIT | Next.js lint preset | Peer allows eslint >=9 |
| @types/node | 22.20.5 | MIT | Node types | Matches engines (22.x) |
| @types/react | 19.2.14 | MIT | React types | |
| @types/react-dom | 19.2.4 | MIT | React DOM types | |
| @types/better-sqlite3 | 9.6.0 | MIT | better-sqlite3 types | Matches better-sqlite3 13.x |
| playwright | 1.64.1 | Apache-2.0 | Browser automation (dev/E2E) | Installed Phase 0; Chromium cached for local smoke |

## Deferred debt

- eslint 9.39.5 is deprecated; migrate to eslint 10.12.0 + @eslint/js 10 once
  eslint-config-next/typescript-eslint peer ranges are confirmed at that
  moment (both currently allow it). Not blocking Phase 0.
- transitive npm deprecation notices from electron-builder toolchain are
  upstream and ignored unless they become errors.
- Full `npm ls --json` license sweep planned as a script in Phase 6.
