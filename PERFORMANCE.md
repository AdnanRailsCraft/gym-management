# Performance — Indexing, Caching, Load Testing

Rules apply to **every app in this project** (and are mirrored in the agent's global
rules file). Phase 0 has an empty schema; guards below activate automatically when
Phase 1 tables land.

## 1. Database indexing

**Rules**

1. Every foreign-key column gets an index. No exceptions — Rails does not add these
   automatically.
2. Composite indexes match the hot query's `WHERE`/`ORDER BY` column order (leading
   column = most selective filter).
3. Never index money/ledger columns for uniqueness — ledger rows are immutable;
   uniqueness is enforced at insert time in app code, not by index.
4. Run `ANALYZE` after bulk imports (SQLite uses it for query plans).
5. WAL checkpoint happens on clean shutdown; long-running imports should call
   `PRAGMA wal_checkpoint(TRUNCATE)` after.

**Enforcement**

```sh
bundle exec rails db:missing_indexes   # fails CI (02-test.ps1) on unindexed FKs
```

Guard source: `lib/tasks/db_indexes.rake`. Trivially green on empty Phase 0 schema;
fails the moment an FK lands without its index.

## 2. Caching

**Config:** `config.cache_store = :memory_store, { size: 64 * 1024 * 1024 }` in
`production.rb` — single-process gym PC, no extra services (no redis/solid_cache).

**Rules**

1. **Never cache ledger or money data** (payments, invoices, balances). Read it fresh.
2. Safe to cache: reference data (plans, staff, settings) keyed by
   `cache_key_with_version` (Rails default) — automatic invalidation on row change.
3. Cache dies on restart — acceptable for single-user; never store anything in the
   cache that isn't rebuildable from SQLite.
4. HTTP responses: `/up` and health JSON stay uncached (already silenced in logs).

## 3. Load testing

**Harness:** `scripts/load/load-test.mjs` — zero dependencies, Node ≥ 18.

```sh
# boot production locally (temp data dir):
export RAILS_ENV=production GMS_DATA_DIR=/tmp/gms-load-data PORT=3921
mkdir -p $GMS_DATA_DIR && bin/rails db:prepare
(exec bin/rails server) &

node scripts/load/load-test.mjs http://127.0.0.1:3921 dist/results/load.json
pkill -f "puma.*3921"
```

Ladder: concurrency 1 / 10 / 50 × 5s on `GET /` and `GET /up`. Output: RPS,
p50/p95/p99, error count → `dist/results/load.json`. Exit 1 if any error.

**Baseline (2026-10-12, Linux dev box, commit `10a0d0b`):**

| Path | Conc | RPS | p50 | p95 | p99 | Err |
|---|---|---|---|---|---|---|
| `/` | 1 | 211.6 | 4.0ms | 6.8ms | 22.4ms | 0 |
| `/` | 10 | 435.0 | 22.2ms | 32.1ms | 39.2ms | 0 |
| `/` | 50 | 445.6 | 109.2ms | 147.0ms | 174.4ms | 0 |
| `/up` | 1 | 306.3 | 2.9ms | 5.8ms | 7.3ms | 0 |
| `/up` | 10 | 673.1 | 14.8ms | 20.4ms | 22.6ms | 0 |
| `/up` | 50 | 686.1 | 72.9ms | 86.5ms | 91.5ms | 0 |

**Regression threshold:** any p95 > 2× baseline (same ladder, same machine class) or
any error > 0 → investigate before merge. Baseline refresh: re-run after meaningful
stack changes (Ruby/Rails/Puma upgrade, middleware added) and update this table.

## 4. When to run what

| When | What |
|---|---|
| Every CI run | `db:missing_indexes` (via `02-test.ps1`) |
| Every local test pass | `bundle exec rails test` |
| Before perf claims / after routing or query changes | load harness + compare to baseline |
| After bulk import | `ANALYZE` + WAL checkpoint |
| Phase 1: new tables land | confirm FK indexes green in CI |
