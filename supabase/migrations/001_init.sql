-- Enable pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- Users table provided by Supabase auth

-- Bank accounts table
create table public.accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  institution  text not null,
  provider_id  text not null,
  name         text,
  type         text,
  currency     text default 'USD',
  balance      numeric(14,2) default 0,
  created_at   timestamp default now()
);

-- Transactions table
create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  account_id    uuid references public.accounts(id) on delete cascade,
  txn_date      date not null,
  amount        numeric(14,2) not null,
  merchant      text,
  description   text,
  category      text,
  imported_via  text not null,
  raw           jsonb,
  created_at    timestamp default now()
);

-- Categorization rules
create table public.rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  pattern     text not null,
  category    text not null,
  created_at  timestamp default now()
);

-- OAuth tokens for Chase
create table public.chase_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  access_token  text,
  refresh_token text,
  expires_at    timestamp
);

-- Optional encryption for tokens
alter table public.chase_tokens
  alter column access_token  set data type bytea using pgp_sym_encrypt(access_token, current_setting('app.aes_key')),
  alter column refresh_token set data type bytea using pgp_sym_encrypt(refresh_token, current_setting('app.aes_key'));

-- Row level security
alter table public.accounts      enable row level security;
alter table public.transactions  enable row level security;
alter table public.rules         enable row level security;
alter table public.chase_tokens  enable row level security;

create policy "Account owner" on public.accounts
  using (auth.uid() = user_id);

create policy "Txn owner" on public.transactions
  using (auth.uid() = user_id);

create policy "Rule owner" on public.rules
  using (auth.uid() = user_id);

create policy "Token owner" on public.chase_tokens
  using (auth.uid() = user_id);

-- Helpful indexes
create index on public.transactions (user_id, txn_date);
create index on public.transactions (user_id, category);
