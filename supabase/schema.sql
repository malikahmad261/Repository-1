-- Household Expense Tracker: database setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
-- It is safe to run more than once.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id text primary key,
  name text not null,
  parent_id text references public.categories(id) on delete restrict,
  default_necessity text not null default 'necessary'
    check (default_necessity in ('necessary', 'discretionary')),
  sort_order integer not null default 0,
  archived boolean not null default false
);

create table if not exists public.transactions (
  id uuid primary key,
  date date not null,
  merchant text not null default '',
  total_amount numeric(14, 2) not null,
  currency text not null default 'PKR',
  payment_method text not null default '',
  notes text not null default '',
  source text not null default 'manual'
    check (source in ('manual', 'text', 'photo', 'share')),
  raw_input text not null default '',
  receipt_path text,
  receipt_uploaded_at timestamptz,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transactions_date_idx on public.transactions (date desc);

create table if not exists public.line_items (
  id uuid primary key,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  position integer not null default 0,
  description text not null default '',
  amount numeric(14, 2) not null,
  category_id text not null references public.categories(id) on delete restrict,
  necessity text not null check (necessity in ('necessary', 'discretionary')),
  quantity numeric
);
create index if not exists line_items_transaction_idx on public.line_items (transaction_id);

create table if not exists public.budgets (
  id uuid primary key,
  scope text not null check (scope in ('category', 'discretionary', 'total')),
  category_id text references public.categories(id) on delete cascade,
  amount numeric(14, 2) not null,
  thresholds integer[] not null default '{50,75,90,100}',
  created_at timestamptz not null default now()
);

create table if not exists public.budget_alerts (
  budget_id uuid not null references public.budgets(id) on delete cascade,
  period text not null,
  threshold integer not null,
  fired_at timestamptz not null default now(),
  primary key (budget_id, period, threshold)
);

create table if not exists public.merchant_rules (
  merchant_key text primary key,
  merchant_name text not null,
  category_id text not null references public.categories(id) on delete cascade,
  necessity text not null check (necessity in ('necessary', 'discretionary')),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Save a transaction and its line items in one step (all or nothing).
-- ---------------------------------------------------------------------------

create or replace function public.save_transaction(txn jsonb, items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.transactions as t (
    id, date, merchant, total_amount, currency, payment_method, notes, source,
    raw_input, receipt_path, receipt_uploaded_at, status, created_at, updated_at
  ) values (
    (txn->>'id')::uuid,
    (txn->>'date')::date,
    coalesce(txn->>'merchant', ''),
    (txn->>'total_amount')::numeric,
    coalesce(txn->>'currency', 'PKR'),
    coalesce(txn->>'payment_method', ''),
    coalesce(txn->>'notes', ''),
    coalesce(txn->>'source', 'manual'),
    coalesce(txn->>'raw_input', ''),
    txn->>'receipt_path',
    (txn->>'receipt_uploaded_at')::timestamptz,
    coalesce(txn->>'status', 'confirmed'),
    coalesce((txn->>'created_at')::timestamptz, now()),
    now()
  )
  on conflict (id) do update set
    date = excluded.date,
    merchant = excluded.merchant,
    total_amount = excluded.total_amount,
    currency = excluded.currency,
    payment_method = excluded.payment_method,
    notes = excluded.notes,
    source = excluded.source,
    raw_input = excluded.raw_input,
    receipt_path = excluded.receipt_path,
    receipt_uploaded_at = excluded.receipt_uploaded_at,
    status = excluded.status,
    updated_at = now();

  delete from public.line_items where transaction_id = (txn->>'id')::uuid;

  insert into public.line_items (id, transaction_id, position, description, amount, category_id, necessity, quantity)
  select
    (item->>'id')::uuid,
    (txn->>'id')::uuid,
    (ord - 1)::integer,
    coalesce(item->>'description', ''),
    (item->>'amount')::numeric,
    item->>'category_id',
    item->>'necessity',
    (item->>'quantity')::numeric
  from jsonb_array_elements(items) with ordinality as x(item, ord);
end;
$$;

-- ---------------------------------------------------------------------------
-- Security: only the signed-in household login can read or write anything.
-- (Also turn OFF "Allow new users to sign up" in Authentication → Sign In / Providers.)
-- ---------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.line_items enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_alerts enable row level security;
alter table public.merchant_rules enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'transactions', 'line_items', 'budgets', 'budget_alerts', 'merchant_rules']
  loop
    execute format('drop policy if exists household_all on public.%I', t);
    execute format(
      'create policy household_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end;
$$;

revoke execute on function public.save_transaction(jsonb, jsonb) from public, anon;
grant execute on function public.save_transaction(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Private storage for receipt photos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists household_receipts on storage.objects;
create policy household_receipts on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts')
  with check (bucket_id = 'receipts');

-- ---------------------------------------------------------------------------
-- Starter categories (edit them later in the app's Settings)
-- ---------------------------------------------------------------------------

insert into public.categories (id, name, parent_id, default_necessity, sort_order) values
  ('groceries', 'Groceries', null, 'necessary', 0),
  ('groceries.staples', 'Staples', 'groceries', 'necessary', 1),
  ('groceries.fresh', 'Fresh food', 'groceries', 'necessary', 2),
  ('groceries.household', 'Household supplies', 'groceries', 'necessary', 3),
  ('groceries.snacks', 'Snacks & sweets', 'groceries', 'discretionary', 4),
  ('groceries.drinks', 'Drinks', 'groceries', 'discretionary', 5),
  ('eating_out', 'Eating out', null, 'necessary', 100),
  ('eating_out.restaurants', 'Restaurants', 'eating_out', 'discretionary', 101),
  ('eating_out.delivery', 'Takeaway & delivery', 'eating_out', 'discretionary', 102),
  ('eating_out.coffee', 'Coffee & snacks', 'eating_out', 'discretionary', 103),
  ('eating_out.work_lunch', 'Work lunches', 'eating_out', 'necessary', 104),
  ('housing', 'Housing', null, 'necessary', 200),
  ('housing.rent', 'Rent / mortgage', 'housing', 'necessary', 201),
  ('housing.maintenance', 'Maintenance & repairs', 'housing', 'necessary', 202),
  ('housing.furniture', 'Furniture & decor', 'housing', 'discretionary', 203),
  ('utilities', 'Utilities', null, 'necessary', 300),
  ('utilities.energy', 'Electricity & gas', 'utilities', 'necessary', 301),
  ('utilities.water', 'Water', 'utilities', 'necessary', 302),
  ('utilities.internet_phone', 'Internet & phone', 'utilities', 'necessary', 303),
  ('utilities.subscriptions', 'Streaming & subscriptions', 'utilities', 'discretionary', 304),
  ('transport', 'Transport', null, 'necessary', 400),
  ('transport.fuel', 'Fuel', 'transport', 'necessary', 401),
  ('transport.public', 'Public transport', 'transport', 'necessary', 402),
  ('transport.ride_hail', 'Taxi & ride-hailing', 'transport', 'discretionary', 403),
  ('transport.car_maintenance', 'Car maintenance', 'transport', 'necessary', 404),
  ('transport.parking', 'Parking & tolls', 'transport', 'necessary', 405),
  ('health', 'Health', null, 'necessary', 500),
  ('health.medical', 'Doctor & hospital', 'health', 'necessary', 501),
  ('health.pharmacy', 'Pharmacy', 'health', 'necessary', 502),
  ('health.fitness', 'Fitness', 'health', 'discretionary', 503),
  ('children', 'Children', null, 'necessary', 600),
  ('children.school', 'School & childcare', 'children', 'necessary', 601),
  ('children.clothing', 'Clothing', 'children', 'necessary', 602),
  ('children.activities', 'Activities', 'children', 'discretionary', 603),
  ('children.toys', 'Toys', 'children', 'discretionary', 604),
  ('personal', 'Personal', null, 'necessary', 700),
  ('personal.clothing', 'Clothing', 'personal', 'discretionary', 701),
  ('personal.care', 'Personal care', 'personal', 'necessary', 702),
  ('personal.hobbies', 'Hobbies', 'personal', 'discretionary', 703),
  ('personal.gifts', 'Gifts', 'personal', 'discretionary', 704),
  ('finance', 'Insurance & finance', null, 'necessary', 800),
  ('finance.insurance', 'Insurance', 'finance', 'necessary', 801),
  ('finance.fees', 'Bank fees', 'finance', 'necessary', 802),
  ('finance.loans', 'Loan repayments', 'finance', 'necessary', 803),
  ('travel', 'Travel', null, 'necessary', 900),
  ('travel.flights', 'Flights', 'travel', 'discretionary', 901),
  ('travel.accommodation', 'Accommodation', 'travel', 'discretionary', 902),
  ('travel.spending', 'Holiday spending', 'travel', 'discretionary', 903),
  ('other', 'Other', null, 'necessary', 1000),
  ('other.uncategorised', 'Uncategorised', 'other', 'discretionary', 1001)
on conflict (id) do nothing;
