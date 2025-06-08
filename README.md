# CashCanvas

CashCanvas is a proof-of-concept personal finance tracker. It demonstrates how to import transactions from CSV files or a bank API and visualize spending. The app uses Next.js for the frontend and Supabase for authentication and storage.

## Development

1. Install dependencies

```bash
npm install
```

2. Set up Supabase

```bash
supabase init
supabase db reset
```

Environment variables required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` – your Vercel/Vite URL for OAuth callbacks
- `CHASE_CLIENT_ID` – OAuth client id

3. Run the development server

```bash
npm run dev
```

4. Run tests

```bash
npm test
```

## Project Structure

- `pages/` – Next.js pages and API routes
- `components/` – React UI components
- `lib/` – helper utilities and database code
- `hooks/` – React hooks for auth and syncing
- `supabase/migrations/` – Postgres schema

## License

MIT
