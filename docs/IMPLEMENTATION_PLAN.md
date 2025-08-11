### CashCanvas – Complete Implementation Plan (Local SQLite-first)

This document is the single source of truth for finishing CashCanvas as a robust, open-source money management app. It covers product goals, architecture, data model, environment setup, phased delivery, task breakdowns, testing, and operations. If you start a new session, reading this alone should be enough to pick up and keep building.

## Product Goals
- Build a delightful, privacy-first personal finance tracker that runs locally in the browser using SQLite (via sql.js) for storage.
- Import transactions from CSV/OFX and visualize: spending by category, monthly overview, and running balance trend.
- Allow users to define categorization rules (regex) and apply them to transactions.
- Optional cloud sync via Supabase for users who want backup/multi-device (behind a feature flag).
- Integrate bank connections (e.g., Chase OAuth) later; keep code paths isolated so local usage is fully functional without it.

## High-level Architecture
- Next.js (Pages Router) UI and API routes.
- Client-side database using sql.js (WebAssembly) with persistence to localStorage. Fallbacks support Jest/Node execution.
- Optional Supabase client for auth and cloud sync. App works without auth.
- Importers parse files client-side; no server upload needed for local-first mode.
- Charts built with Recharts on top of SQL queries.

## Data Model (SQLite)
- tables
  - users(id TEXT PRIMARY KEY, display_name TEXT, email TEXT, phone TEXT, avatar_url TEXT, supabase_user_id TEXT, created_at TEXT)
  - settings(key TEXT PRIMARY KEY, value TEXT)
  - transactions(id TEXT PRIMARY KEY, user_id TEXT, date TEXT, amount REAL, description TEXT, merchant TEXT, category TEXT)
  - rules(id TEXT PRIMARY KEY, user_id TEXT, pattern TEXT NOT NULL, category TEXT NOT NULL, created_at TEXT)
  - accounts(id TEXT PRIMARY KEY, user_id TEXT, name TEXT, type TEXT, balance REAL, currency TEXT)

- indexes
  - idx_transactions_date ON transactions(date)
  - idx_transactions_category ON transactions(category)
  - idx_tx_user_date ON transactions(user_id, date)
  - idx_tx_user_category ON transactions(user_id, category)

Notes
- date stored as YYYY-MM-DD.
- id for transactions is deterministic (hash of userId+date+description+amount) for new rows; legacy rows are auto-backfilled to `local_default`.
- category can be null and filled by rule application.

## Environment & Assets
- Required env for Supabase (optional): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL.
- Optional Chase OAuth: CHASE_CLIENT_ID, CHASE_CLIENT_SECRET, CHASE_REDIRECT_URI (integration left for later).
- sql.js wasm: prefer local file at /public/sql-wasm.wasm. Fallback to node_modules/sql.js/dist/sql-wasm.wasm in Node (Jest), and CDN if local not present.

## Phased Delivery
Phase 1 – Solidify Local DB and Data Flow (DONE)
- Implement real sql.js database in lib/sqlite/init.ts with:
  - initDatabase(): load wasm, create schema, load from localStorage if exists, expose helpers.
  - query(sql, params?): run SELECT and return rows as objects.
  - run(sql, params?): exec non-SELECT.
  - upsert(table, row): upsert by primary key.
  - bulkUpsert(table, rows): transactional bulk insert/update.
  - persist(): save db to localStorage (debounced).
  - applyRulesToTransactions(): apply regex rules to uncategorized transactions.

✔ Update charts to use real query results (remove mocks).
✔ PieSpend: built with Recharts; aggregate tiny slices into Other; center total; distinct colors.
✔ LineTrend: client-side cumulative series for reliability; gradient area + line.
✔ BarMonthly: gradient fill (teal→violet), consistent currency labels.
✔ Client-side import: parses CSV/OFX and inserts into SQLite.
✔ Rules persisted via TagModal and re-applied.
✔ API upload deprecated (410) in favor of client import.
✔ Local-first db seeding for demo; clear by removing localStorage key `cashcanvas_seeded`.

Phase 2 – Quality, UX, and Testing (IN PROGRESS)
- Add data validation and error handling in parsers.
- Add transaction deduplication and id hashing.
- Add unit tests for DB layer, parsers, and categorize rules.
✔ Improve UI/UX: added themeable layout, responsive grid, and mobile bottom nav.
✔ Import UX: drag-and-drop/tap-to-upload dropzone with progress and messages.
✔ Charts visual refinement and accessibility-conscious palette.
→ Next: KPI cards (Income/Expense/Net), date-range filters, transaction list mobile layout, rules manager UI.

## Changelog (chronological)

- 2025-08-07
  - Implemented real sql.js DB with localStorage persistence and helpers (init/query/run/upsert/bulkUpsert/rules).
  - Added demo data seeding on first load; inserted sample rules; applied categorization.
  - Replaced mocked charts with Recharts implementations; improved Pie/Bar/Line styles and reliability.
  - Built client-side importer and then upgraded to a drag-and-drop/tap dropzone component.
  - Created app layout, theme toggle, and mobile bottom navigation; added global design tokens and styles.
  - Deprecated server upload route; fixed tests; ensured wasm path resolution in Node and browser.
- Add simple settings page (export/import DB file JSON; clear DB; toggle cloud sync).
- 2025-08-08
  - Added local PDF import (no OCR) using pdf.js: new `lib/pdf/parsePdf.ts` groups text rows, infers columns, and maps to `ParsedTransaction`.
  - Updated `components/Importer.tsx` to accept `.pdf` alongside `.csv`/`.ofx` and route to the PDF parser.
  - Installed `pdfjs-dist` and exposed worker at `public/pdf.worker.min.mjs` for client-only execution.
  - Added sample fixture `__tests__/fixtures/chase_sample_1.pdf` for validation.
  - Behavior: if a PDF yields no text/rows, we show a friendly error (no OCR fallback in MVP).

Phase 3 – Optional Cloud Sync (Supabase)
- Implement opt-in cloud sync: upload transactions and accounts to Supabase tables.
- Auth guard for sync actions; user-specific scoping.
- Conflict resolution: local wins; uploads are upserts.
- Background sync button and status.

### Local multi-user (completed)
- Added `users` and `settings` tables to local SQLite. `settings.current_user_id` selects the active local user.
- Added `user_id` to local `transactions`, `rules`, and `accounts`; added user-scoped indexes.
- Backfilled existing rows to default `local_default` user. Seeded demo data under the current user.
- All queries and rule application now scope by `user_id`.
- Importer rewrites transaction ids to include user scope and stamps `user_id` per row.
- Layout now includes a user switcher with add/delete (max 10 users per device).

### Supabase alignment
- API routes now use server-side Supabase client and the authenticated `user.id`.
- Chase tokens stored against the authenticated user.
- Accounts/transactions upserts stamp `user_id`.
- Prepared Supabase migration to add `client_uid` on `transactions` and `rules` for de-duplication across devices.

Phase 4 – Bank Connections (Chase)
- Keep current OAuth and sync API routes isolated. When keys available:
  - Use session user id instead of 'current_user'.
  - Add secure storage for tokens.
  - Map Chase transactions to local schema; merge into local DB; mark source.

## Detailed Tasks (Phase 1)
1) Implement sql.js DB (lib/sqlite/init.ts)
- Load sql.js with locateFile that supports browser (/sql-wasm.wasm) and Node (node_modules path).
- Create tables and indexes if not exist.
- Implement helpers: initDatabase, query, run, upsert, bulkUpsert, persist, getRules, applyRulesToTransactions.
- Persist db to localStorage after mutating operations (debounced to avoid thrash).

2) Update Importer (components/Importer.tsx)
- Read file client-side using FileReader.
- Parse CSV via PapaParse; OFX via ofx-js (fallback regex if needed).
- Parse PDF via pdf.js (text-selectable statements only; no OCR); infer Date/Description/Amount and generate stable ids.
- Normalize to transaction schema and compute id (hash).
- Insert via bulkUpsert and then applyRulesToTransactions.
- Call onImportComplete to refresh charts.

3) Update Parsers (lib/parsers.ts)
- Implement robust CSV parsing (headers support; trimming; amount normalization with parentheses and commas).
- Implement OFX parsing using ofx-js; fallback simple regex if parser fails.

4) Charts
8) PDF Parsing (lib/pdf/parsePdf.ts) – DONE (MVP)
- Install `pdfjs-dist`; copy worker to `public/` and set `GlobalWorkerOptions.workerSrc`.
- Extract text content per page; group by Y, sort by X; detect header rows.
- Heuristically select Amount and Description; normalize date and amount; hash id.
- De-duplicate transactions within a statement; surface friendly errors when no rows found.
- Replace PieSpend with Recharts PieChart + Legend.

9) Local multi-user – DONE
- Schema migration with `users`, `settings`, and `user_id` columns; indexes and backfill to `local_default`.
- User management helpers: list/create/delete/setCurrent/getCurrent.
- UI user switcher in header; enforce ≤10 users.
- Update importer/queries/rules to be user-scoped.
- Ensure BarMonthly and LineTrend formatting consistent.

5) TagModal and Rule Persistence
- On save: insert into rules (id uuid), persist, and trigger applyRulesToTransactions.
- Refresh charts after applying rules.

6) API upload deprecation
- Change pages/api/upload.ts to return 410 Gone with message pointing to client-side import.

7) README and Docs
- Document local-first usage, DB persistence, wasm placement, and optional Supabase.

## Developer Notes
- Avoid using React hooks in API routes.
- Keep browser-only modules guarded (typeof window !== 'undefined').
- For pdf.js, always run in browser; avoid SSR imports in API routes.
- Use small, safe SQL with parameters; never interpolate user input directly.
- TypeScript: keep exported APIs typed; internal variables can be inferred.

## Testing
- Unit tests for categorize(), parsers, and DB helpers.
- Jest environment uses Node; sql.js loads wasm from node_modules path.
- Mock localStorage when running in Node.

## Release Criteria (Phase 1)
- Import CSV and OFX locally; data persists across refresh via localStorage.
- Charts show real data from SQLite queries.
- Rules can be added and applied; re-categorization reflected in charts.
- No runtime errors; yarn test passing; build succeeds.

## Future Enhancements
- Rule management UI (list/edit/delete; priority ordering).
- Budgeting and goals.
- Multi-currency handling.
- Tagging beyond categories (labels, projects).
- Data export/import to file.


