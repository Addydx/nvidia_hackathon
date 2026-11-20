-- Corte de caja · Fase 1 (Caja). Importes en centavos enteros.

create table if not exists public.cash_sessions (
  id            uuid primary key default gen_random_uuid(),
  opening_cents bigint not null check (opening_cents >= 0 and opening_cents <= 99999999),
  status        text   not null default 'open' check (status in ('open', 'closed')),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz
);

-- Solo una caja abierta a la vez.
create unique index if not exists cash_sessions_one_open
  on public.cash_sessions ((status)) where status = 'open';

-- El id lo genera el cliente y funciona como llave de idempotencia:
-- reintentar el mismo guardado no puede crear una segunda venta.
create table if not exists public.sales (
  id           uuid primary key,
  session_id   uuid not null references public.cash_sessions (id),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 99999999),
  created_at   timestamptz not null default now()
);

create index if not exists sales_session_created_idx
  on public.sales (session_id, created_at);

-- Las escrituras se hacen desde el servidor con la service role key
-- (que ignora RLS). Sin políticas, anon/authenticated no acceden a nada.
alter table public.cash_sessions enable row level security;
alter table public.sales enable row level security;
