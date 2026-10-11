-- Koliko para: šema baze.
-- Pokreni jednom u Supabase: SQL Editor > New query > nalepi ceo fajl > Run.

-- Stavke iz banke (izvod ili screenshot), jedna po transakciji.
create table if not exists public.transactions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  date date not null,
  description text not null,
  amount numeric(14,2) not null,
  source text not null default 'bank',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists transactions_user_date on public.transactions (user_id, date);

-- Ručne izmene kategorije za pojedinačnu stavku iz banke.
create table if not exists public.overrides (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tx_id text not null,
  cat text not null,
  person text not null default '',
  pass numeric(14,2),
  updated_at timestamptz not null default now(),
  primary key (user_id, tx_id)
);

-- Pravila: opis koji sadrži "match" ide u kategoriju "cat".
-- kind = 'merchant' za stavke iz banke, 'item' za artikle sa računa.
create table if not exists public.rules (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'merchant',
  match text not null,
  cat text not null,
  person text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, match)
);

-- Skenirani dokumenti: fiskalni računi, uplatnice i ručni unosi.
create table if not exists public.receipts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  kind text not null,                 -- 'fiscal' | 'ips' | 'manual'
  source_url text,                    -- link iz QR koda fiskalnog računa
  qr_text text,                       -- sirov tekst QR koda (uplatnica)
  issued_at timestamptz not null,
  merchant text not null default '',
  store text not null default '',
  total numeric(14,2) not null,
  payment text not null default 'kartica',   -- 'gotovina' | 'kartica' | 'racun'
  refund boolean not null default false,
  cat text,                           -- kategorija za ručni unos ili celu uplatnicu
  person text not null default '',
  items jsonb not null default '[]'::jsonb,
  journal text,                       -- ceo tekst računa, za kasnije ponovno čitanje
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index if not exists receipts_user_url on public.receipts (user_id, source_url) where source_url is not null;

-- Svaki korisnik vidi i menja samo svoje redove.
alter table public.transactions enable row level security;
alter table public.overrides    enable row level security;
alter table public.rules        enable row level security;
alter table public.receipts     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['transactions','overrides','rules','receipts'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
