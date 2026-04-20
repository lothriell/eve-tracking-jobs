# Task Tracker

## 2026-04-20 — Corp Industry History & Dashboard

### Warehouse Decision: NO separate warehouse (yet)

**Recommendation: stay in SQLite with append-only history tables.**

Why:
- Single-user / small-team app. Volume is tiny (~100s of rows/day even at peak).
- Pattern already proven in the codebase: `wealth_snapshots`, `wallet_journal`, `wallet_transactions` are all append-only SQLite tables that work well.
- SQLite with WAL handles this for years without strain. Deployment stays one pod + one PVC.
- DuckDB/TimescaleDB/Postgres all add operational cost (new pod, backups, secrets) with no payoff at current scale.
- Clean upgrade path if we outgrow it: DuckDB can `ATTACH` the SQLite file directly and run analytical queries against it — no migration needed.

What we WILL do to future-proof:
- Adopt a naming convention: history tables end in `_history`, are append-only, have `archived_at` column.
- When `INSERT OR REPLACE` is used for current-state tables (prices, indices), add a parallel `_history` table if we want trend analysis.
- Keep the dashboard queries aggregatable (group by month/product/installer) so they port trivially to any SQL warehouse later.

### Phase 1 — Backend archival (the foundation)
- [ ] Add `corp_job_history` table to `backend/database/schema.sql`
  - PK: `job_id` (dedup; ESI job_id is globally unique)
  - Columns: corporation_id, installer_id, installer_name, activity_id, blueprint_type_id, product_type_id, product_name, product_group_id, product_category_id, runs, licensed_runs, facility_id, station_id, start_date, end_date, status, cost, archived_at
  - Indexes on (corporation_id, end_date), (product_type_id, end_date), (installer_id, end_date), (product_group_id, end_date)
- [ ] Add DB helpers in `backend/db.js`: `insertCorpJobHistory()` (INSERT OR IGNORE), `queryCorpJobStats()`, `queryCorpJobHistory()`
- [ ] Add `archiveCorpJobs()` in `backend/services/cacheRefresh.js`
  - Runs every 15 minutes (completed jobs can disappear from ESI after ~30 days)
  - For each user with director/factory_manager + corp scope: fetch `include_completed=true`, filter status in ('delivered', 'cancelled'), INSERT OR IGNORE
  - Denormalize product name/group/category from SDE tables at insert time
- [ ] Add endpoints in `backend/controllers/corporationController.js`:
  - `GET /corporation/industry/stats?from=&to=&group_by=month|product|installer|group&activity=`
  - `GET /corporation/industry/history?from=&to=&limit=&offset=` (raw table)
  - `POST /corporation/industry/backfill` (admin-only, pulls ESI completed window once)
- [ ] Wire into `backend/routes/api.js`

### Phase 2 — Frontend dashboard (MVP)
- [ ] New `frontend/src/components/CorporationIndustryStats.jsx`
- [ ] Headline cards: Jobs completed (this month / all time), Unique products, Active installers, Total job cost
- [ ] Top products table (e.g., "Nidhoggur × 12", sortable by runs/count)
- [ ] Top installers table
- [ ] Date range filter (preset: this month, last month, last 3 months, all time)
- [ ] Activity filter (manufacturing, reactions, invention)
- [ ] Wire into `Main.jsx` navigation — new `corp-industry-stats` view OR tab on existing corp-jobs page

### Phase 3 — Charts & polish
- [ ] Monthly trend: line/bar chart of jobs-per-month (hand-rolled Canvas2D to match `WealthChart.jsx`)
- [ ] Category breakdown: stacked bars by product group (Ships / Modules / Charges / Components)
- [ ] CSV export (reuse `services/export.js`)
- [ ] Optional: ISK-value produced (product × runs × Jita sell at completion time — or current price as approximation)

### Phase 4 — Stretch / parallel track
- [ ] `hub_price_history(type_id, station_id, sell_min, buy_max, captured_at)` — snapshot before each 30-min price refresh. Same append-only pattern. Unlocks price trend charts in Trading view.
- [ ] `character_job_history` — same idea, personal industry. Low effort once corp version is done.

### Known Limits & Tradeoffs
- **History starts the day we ship.** ESI only retains ~30 days of completed jobs, so we get a one-time backfill of the last month and then forward-only.
- **Corp membership changes**: a character leaving the corp still shows their historical jobs (installer_name is denormalized at insert time; fine for "who built what").
- **Product grouping**: we denormalize `group_id` / `category_id` from SDE, so post-hoc reclassification (e.g., CCP moving a hull between groups) requires a backfill script. Acceptable — rare and we can always rebuild from ESI.
- **Job cost** (`cost` field) is the install cost only, not EIV. Good enough for "how much ISK we pumped through the system" but not for true ISK-produced — that'd need Jita price × product × runs.
