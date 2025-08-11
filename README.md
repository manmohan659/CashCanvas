# CashCanvas

CashCanvas is a local-first personal finance tracker built with Next.js. Import transactions (CSV/PDF or bank API), categorize, and visualize spending. Supabase can be used for auth/storage, but the core experience works entirely in the browser using `sql.js`.

## Prerequisites

- Node.js 20+ and npm
- Optional: Supabase CLI if you plan to run Supabase locally (`brew install supabase/tap/supabase`)

## Quick Start

1) Install dependencies

```bash
npm install
```

2) Configure environment

Copy `.env.example` to `.env.local` and fill in values as needed:

```bash
cp .env.example .env.local
```

Required/Optional vars:

- `NEXT_PUBLIC_SITE_URL` (required): Base URL of the app (e.g., `http://localhost:3000`).
- `NEXT_PUBLIC_SUPABASE_URL` (optional): Only if using Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional): Only if using Supabase.
- `CHASE_CLIENT_ID` (optional): Only if using Chase OAuth.
- `CHASE_CLIENT_SECRET` (optional): Only if using Chase OAuth.
- `CHASE_REDIRECT_URI` (optional): Must match `.../api/auth/chase/callback`. For local dev: `http://localhost:3000/api/auth/chase/callback`.

LLM setup: No server env needed. API keys are stored client-side via the in-app "AI Settings" modal and are never sent to the server.

3) Run the development server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

4) Run tests

```bash
npm test
```

## Optional: Supabase Local

If you want to run Supabase locally:

```bash
supabase init
supabase db reset
# or
supabase start
```

Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` match your local Supabase instance.

## Assets and Local-First DB

- `public/sql-wasm.wasm` is required by `sql.js` in the browser and is already included.
- `public/pdf.worker.min.mjs` is included for PDF parsing.
- Browser persists the SQLite database to `localStorage`; no server DB is required.

## Project Structure

- `pages/` – Next.js pages and API routes
- `components/` – React UI components
- `lib/` – utilities (`sqlite` local DB, parsers, agent)
- `hooks/` – React hooks for auth and syncing
- `supabase/migrations/` – (optional) Postgres schema

## License

MIT
