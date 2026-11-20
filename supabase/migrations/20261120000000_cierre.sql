-- Corte de caja · Fase 2 (Cierre). Importes en centavos enteros.
-- Requiere 20261119000000_caja.sql.

create table if not exists public.cash_closings (
  id               uuid primary key default gen_random_uuid(),
  -- unique: una caja solo puede tener un cierre (llave de idempotencia).
  session_id       uuid not null unique references public.cash_sessions (id),
  coins_1          integer not null check (coins_1  between 0 and 99999),
  coins_2          integer not null check (coins_2  between 0 and 99999),
  coins_5          integer not null check (coins_5  between 0 and 99999),
  coins_10         integer not null check (coins_10 between 0 and 99999),
  expected_cents   bigint  not null check (expected_cents >= 0),
  counted_cents    bigint  not null check (counted_cents >= 0),
  -- contado menos esperado: negativo = faltan, positivo = sobran.
  difference_cents bigint  not null,
  closed_at        timestamptz not null default now(),
  check (counted_cents = (coins_1 * 1 + coins_2 * 2 + coins_5 * 5 + coins_10 * 10) * 100::bigint),
  check (difference_cents = counted_cents - expected_cents)
);

alter table public.cash_closings enable row level security;

-- Una caja cerrada no acepta ventas nuevas, ni siquiera en una carrera con el cierre:
-- el SHARE lock espera al FOR UPDATE de close_cash_session y luego ve status = 'closed'.
-- Un reintento de una venta ya guardada pasa (el INSERT termina en ON CONFLICT DO NOTHING).
create or replace function public.sales_require_open_session()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  s text;
begin
  if exists (select 1 from public.sales where id = new.id) then
    return new;
  end if;
  select status into s from public.cash_sessions where id = new.session_id for share;
  if s is distinct from 'open' then
    raise exception 'La caja no está abierta' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_require_open_session on public.sales;
create trigger sales_require_open_session
  before insert on public.sales
  for each row execute function public.sales_require_open_session();

-- Cierra la caja en una sola transacción. El esperado, el contado y la diferencia
-- se calculan aquí, nunca con importes que mande el cliente.
-- Idempotente: si la caja ya tiene cierre devuelve ese mismo cierre con duplicate = true.
create or replace function public.close_cash_session(p_session_id uuid, p_coins jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  sess     public.cash_sessions;
  existing public.cash_closings;
  c1 integer; c2 integer; c5 integer; c10 integer;
  v_expected bigint;
  v_counted  bigint;
  closing    public.cash_closings;
begin
  select * into sess from public.cash_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;

  select * into existing from public.cash_closings where session_id = p_session_id;
  if found then
    return to_jsonb(existing) || jsonb_build_object('duplicate', true);
  end if;

  if sess.status <> 'open' then
    raise exception 'La caja no está abierta' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_coins) is distinct from 'object' then
    raise exception 'Conteo no válido' using errcode = '22023';
  end if;
  begin
    c1  := (p_coins ->> '1')::integer;
    c2  := (p_coins ->> '2')::integer;
    c5  := (p_coins ->> '5')::integer;
    c10 := (p_coins ->> '10')::integer;
  exception when others then
    raise exception 'Conteo no válido' using errcode = '22023';
  end;
  if c1 is null or c2 is null or c5 is null or c10 is null
     or least(c1, c2, c5, c10) < 0 or greatest(c1, c2, c5, c10) > 99999 then
    raise exception 'Conteo no válido' using errcode = '22023';
  end if;

  select sess.opening_cents + coalesce(sum(amount_cents), 0) into v_expected
    from public.sales where session_id = p_session_id;
  v_counted := (c1 * 1 + c2 * 2 + c5 * 5 + c10 * 10) * 100::bigint;

  insert into public.cash_closings
    (session_id, coins_1, coins_2, coins_5, coins_10, expected_cents, counted_cents, difference_cents)
  values
    (p_session_id, c1, c2, c5, c10, v_expected, v_counted, v_counted - v_expected)
  returning * into closing;

  update public.cash_sessions set status = 'closed', closed_at = closing.closed_at where id = p_session_id;

  return to_jsonb(closing) || jsonb_build_object('duplicate', false);
end;
$$;

-- Solo el servidor (service role) puede cerrar cajas.
revoke all on function public.close_cash_session(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.close_cash_session(uuid, jsonb) to service_role;
