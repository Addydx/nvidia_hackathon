-- VendIA · Cobros con Stripe Checkout. Importes en centavos enteros (MXN).
-- Aditiva: no toca tablas ni funciones existentes. Rollback: supabase/rollback/20261123000000_cobros_down.sql
--
-- Modelo de acceso (igual que las cajas): el servidor usa la service role y filtra SIEMPRE por user_id.
-- RLS activado y sin políticas: anon/authenticated no acceden a nada.

-- Cobros. El id lo genera el cliente (llave de idempotencia: reintentar no crea un segundo cobro)
-- y viaja a Stripe como client_reference_id / metadata.payment_id.
create table if not exists public.payments (
  id                       uuid primary key,
  user_id                  uuid not null references auth.users (id) on delete restrict,
  amount_cents             bigint not null check (amount_cents >= 1000 and amount_cents <= 99999999),
  currency                 text   not null default 'mxn' check (currency = 'mxn'),
  status                   text   not null default 'pending'
                           check (status in ('pending', 'processing', 'paid', 'failed', 'expired')),
  -- null = cuenta Stripe del propietario de la plataforma; 'acct_…' = cuenta conectada (Stripe Connect).
  stripe_account_id        text,
  stripe_session_id        text unique,
  stripe_payment_intent_id text,
  checkout_url             text,
  expires_at               timestamptz,
  paid_at                  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists payments_user_created_idx on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- Eventos de Stripe ya procesados (el id evt_… es único): reentregas del webhook no se reprocesan.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- Cuenta conectada de cada vendedor (Stripe Connect). Vacía hasta que Connect se active.
create table if not exists public.stripe_accounts (
  user_id           uuid primary key references auth.users (id) on delete restrict,
  stripe_account_id text not null unique,
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,
  details_submitted boolean not null default false,
  updated_at        timestamptz not null default now()
);
alter table public.stripe_accounts enable row level security;
revoke all on public.stripe_accounts from anon, authenticated;

-- Transición de estado monótona: «paid» es terminal y nunca se revierte por un evento tardío o repetido.
-- Devuelve la fila resultante (o null si no existe). Solo la ejecuta el servidor.
create or replace function public.apply_payment_status(
  p_session_id text,
  p_status text,
  p_payment_intent text,
  p_paid_at timestamptz
)
returns public.payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.payments;
begin
  if p_status not in ('pending', 'processing', 'paid', 'failed', 'expired') then
    raise exception 'Estado no válido' using errcode = '22023';
  end if;

  update public.payments
     set status = p_status,
         stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id),
         paid_at = case when p_status = 'paid' then coalesce(p_paid_at, now()) else paid_at end,
         updated_at = now()
   where stripe_session_id = p_session_id
     and status <> 'paid'
  returning * into r;

  if not found then
    select * into r from public.payments where stripe_session_id = p_session_id;
  end if;
  return r;
end;
$$;

revoke all on function public.apply_payment_status(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_payment_status(text, text, text, timestamptz) to service_role;
