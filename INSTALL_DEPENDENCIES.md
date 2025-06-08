# Installing Project Dependencies

This document provides commands to install the necessary dependencies for the CashCanvas project.

## Standard Installation (if `package.json` exists)

If you have a `package.json` file in your project root (`/Users/manmohan/Documents/Track/CashCanvas/`), you can install all listed dependencies by running one of the following commands in your terminal, depending on the package manager you are using:

### Using npm
```bash
npm install
```

### Using Yarn
```bash
yarn install
```

### Using pnpm
```bash
pnpm install
```

## Specific Dependencies

Based on the project files (e.g., Next.js, TypeScript, Supabase integration, charting libraries), here are some key dependencies. If you are setting up the project manually or need to ensure these are installed:

### Core Next.js and React
```bash
npm install next react react-dom
# or
yarn add next react react-dom
# or
pnpm add next react react-dom
```

### TypeScript and Type Definitions (as development dependencies)
```bash
npm install --save-dev typescript @types/node @types/react @types/react-dom
# or
yarn add --dev typescript @types/node @types/react @types/react-dom
# or
pnpm add --save-dev typescript @types/node @types/react @types/react-dom
```

### Charting Library (Recharts)
Used in components like `BarMonthly.tsx` and `LineTrend.tsx`.
```bash
npm install recharts
# or
yarn add recharts
# or
pnpm add recharts
```

### SQLite Library (sql.js)
Used in `lib/sqlite/init.ts` for database operations.
```bash
npm install sql.js
# or
yarn add sql.js
# or
pnpm add sql.js
```
You will also need the type definitions for `sql.js` if you are using TypeScript:
```bash
npm install --save-dev @types/sql.js
# or
yarn add --dev @types/sql.js
# or
pnpm add --save-dev @types/sql.js
```

### Supabase Client (if using Supabase)
The file `/Users/manmohan/Documents/Track/CashCanvas/pages/api/auth/chase/callback.ts` suggests potential use of Supabase.
```bash
npm install @supabase/supabase-js
# or
yarn add @supabase/supabase-js
# or
pnpm add @supabase/supabase-js
```

Choose the commands appropriate for your setup and package manager. If you initialized your project with `create-next-app`, many of these (like Next.js, React, TypeScript, and types) would have been set up automatically. In that case, `npm install` (or its equivalent) is usually sufficient after cloning or setting up the project.