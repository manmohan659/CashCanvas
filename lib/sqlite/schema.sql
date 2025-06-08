create table accounts (
  id           text primary key,
  institution  text,
  provider_id  text,
  name         text,
  type         text,
  currency     text,
  balance      real,
  created_at   text
);

create table transactions (
  id            text primary key,
  account_id    text,
  txn_date      text,
  amount        real,
  merchant      text,
  description   text,
  category      text,
  imported_via  text,
  created_at    text
);

create index idx_txn_date on transactions(txn_date);
