-- Corte de caja · Cuentas por correo (Supabase Auth). Aísla cada caja por usuario.
-- Requiere 20261119000000_caja.sql, 20261120000000_cierre.sql y 20261121000000_eliminar_caja.sql.
--
-- Modelo de acceso: el servidor (service role) verifica la sesión y pasa el id del usuario a
-- estas funciones y consultas. anon/authenticated siguen sin acceso directo (RLS sin políticas).

-- 1. Dueño de cada caja. Nullable a propósito: las cajas anteriores no tienen dueño conocido
--    y quedan "pendientes de asignar": ningún usuario las ve hasta que se les asigne uno
--    (ver el comentario al final de este archivo).
alter table public.cash_sessions
  add column if not exists user_id uuid references auth.users (id) on delete restrict;

create index if not exists cash_sessions_user_idx on public.cash_sessions (user_id, opened_at desc);

-- 2. Una caja abierta POR USUARIO (antes: una global).
drop index if exists public.cash_sessions_one_open;
create unique index if not exists cash_sessions_one_open_per_user
  on public.cash_sessions (user_id) where status = 'open' and user_id is not null;

-- 3. Cierre: solo el dueño. Una caja ajena responde igual que una inexistente (P0002),
--    para no revelar que existe.
drop function if exists public.close_cash_session(uuid, jsonb);
create or replace function public.close_cash_session(p_user_id uuid, p_session_id uuid, p_coins jsonb)
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
  if p_user_id is null then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;

  select * into sess from public.cash_sessions
   where id = p_session_id and user_id = p_user_id for update;
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

-- 4. Limpiar caja (antes «eliminar»): solo el dueño y solo si sigue abierta.
drop function if exists public.delete_open_cash_session(uuid);
create or replace function public.delete_open_cash_session(p_user_id uuid, p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  sess public.cash_sessions;
  n    integer;
begin
  if p_user_id is null then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;

  select * into sess from public.cash_sessions
   where id = p_session_id and user_id = p_user_id for update;
  if not found then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  if sess.status <> 'open' or exists (select 1 from public.cash_closings where session_id = p_session_id) then
    raise exception 'La caja ya está cerrada' using errcode = 'P0001';
  end if;

  delete from public.sales where session_id = p_session_id;
  get diagnostics n = row_count;
  delete from public.cash_sessions where id = p_session_id;

  return jsonb_build_object('deleted_sales', n);
end;
$$;

-- 5. Abrir caja: crea la caja del usuario. Devuelve null si ya tiene una abierta.
create or replace function public.open_cash_session(p_user_id uuid, p_opening_cents bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.cash_sessions;
begin
  if p_user_id is null then
    raise exception 'Sesión no válida' using errcode = 'P0002';
  end if;
  insert into public.cash_sessions (user_id, opening_cents)
  values (p_user_id, p_opening_cents)
  on conflict (user_id) where status = 'open' and user_id is not null do nothing
  returning * into s;
  if not found then
    return null;
  end if;
  return jsonb_build_object('id', s.id, 'opening_cents', s.opening_cents, 'opened_at', s.opened_at);
end;
$$;

-- Solo el servidor (service role) puede ejecutarlas.
revoke all on function public.close_cash_session(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.delete_open_cash_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.open_cash_session(uuid, bigint) from public, anon, authenticated;
grant execute on function public.close_cash_session(uuid, uuid, jsonb) to service_role;
grant execute on function public.delete_open_cash_session(uuid, uuid) to service_role;
grant execute on function public.open_cash_session(uuid, bigint) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Cajas anteriores (user_id null): quedan sin dueño y ningún usuario las ve.
-- Para asignarlas cuando se sepa de quién son (ejecutar a mano, con el id real del usuario):
--   select id, email from auth.users;                       -- localizar al dueño
--   update public.cash_sessions set user_id = '<uuid del usuario>' where user_id is null and id = '<id de la caja>';
-- Si la caja anterior sigue abierta y el usuario ya abrió otra, el índice único lo impedirá:
-- ciérrala o límpiala primero.
-- ---------------------------------------------------------------------------------------------
