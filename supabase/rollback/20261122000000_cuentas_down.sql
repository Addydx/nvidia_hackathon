-- Recuperación de 20261122000000_cuentas.sql: deja la base compatible con la versión ANTERIOR de la app
-- (sin cuentas). NO está en supabase/migrations a propósito: no se aplica sola con `supabase db push`.
--
-- Qué conserva: la columna cash_sessions.user_id y todos los datos (cajas, ventas, cierres); nada se borra.
-- Qué restaura: las funciones close_cash_session(uuid, jsonb) y delete_open_cash_session(uuid) sin dueño
-- y el índice único global de una caja abierta.
--
-- ANTES de ejecutarlo: solo puede haber UNA caja abierta en toda la base (la versión anterior lo exige).
--   select id, user_id, opening_cents from public.cash_sessions where status = 'open';
-- Si hay varias, cierra o limpia las sobrantes primero; si no, el índice de abajo fallará y todo el script se revierte.
begin;

drop function if exists public.open_cash_session(uuid, bigint);
drop function if exists public.close_cash_session(uuid, uuid, jsonb);
drop function if exists public.delete_open_cash_session(uuid, uuid);

drop index if exists public.cash_sessions_one_open_per_user;
create unique index cash_sessions_one_open on public.cash_sessions ((status)) where status = 'open';

create or replace function public.close_cash_session(p_session_id uuid, p_coins jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  sess public.cash_sessions; existing public.cash_closings;
  c1 integer; c2 integer; c5 integer; c10 integer;
  v_expected bigint; v_counted bigint; closing public.cash_closings;
begin
  select * into sess from public.cash_sessions where id = p_session_id for update;
  if not found then raise exception 'Caja no encontrada' using errcode = 'P0002'; end if;
  select * into existing from public.cash_closings where session_id = p_session_id;
  if found then return to_jsonb(existing) || jsonb_build_object('duplicate', true); end if;
  if sess.status <> 'open' then raise exception 'La caja no está abierta' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_coins) is distinct from 'object' then raise exception 'Conteo no válido' using errcode = '22023'; end if;
  begin
    c1 := (p_coins ->> '1')::integer; c2 := (p_coins ->> '2')::integer;
    c5 := (p_coins ->> '5')::integer; c10 := (p_coins ->> '10')::integer;
  exception when others then raise exception 'Conteo no válido' using errcode = '22023';
  end;
  if c1 is null or c2 is null or c5 is null or c10 is null
     or least(c1, c2, c5, c10) < 0 or greatest(c1, c2, c5, c10) > 99999 then
    raise exception 'Conteo no válido' using errcode = '22023';
  end if;
  select sess.opening_cents + coalesce(sum(amount_cents), 0) into v_expected from public.sales where session_id = p_session_id;
  v_counted := (c1 * 1 + c2 * 2 + c5 * 5 + c10 * 10) * 100::bigint;
  insert into public.cash_closings (session_id, coins_1, coins_2, coins_5, coins_10, expected_cents, counted_cents, difference_cents)
  values (p_session_id, c1, c2, c5, c10, v_expected, v_counted, v_counted - v_expected) returning * into closing;
  update public.cash_sessions set status = 'closed', closed_at = closing.closed_at where id = p_session_id;
  return to_jsonb(closing) || jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.delete_open_cash_session(p_session_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare sess public.cash_sessions; n integer;
begin
  select * into sess from public.cash_sessions where id = p_session_id for update;
  if not found then raise exception 'Caja no encontrada' using errcode = 'P0002'; end if;
  if sess.status <> 'open' or exists (select 1 from public.cash_closings where session_id = p_session_id) then
    raise exception 'La caja ya está cerrada' using errcode = 'P0001';
  end if;
  delete from public.sales where session_id = p_session_id;
  get diagnostics n = row_count;
  delete from public.cash_sessions where id = p_session_id;
  return jsonb_build_object('deleted_sales', n);
end;
$$;

revoke all on function public.close_cash_session(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.delete_open_cash_session(uuid) from public, anon, authenticated;
grant execute on function public.close_cash_session(uuid, jsonb) to service_role;
grant execute on function public.delete_open_cash_session(uuid) to service_role;
commit;
