-- Corte de caja · Contar monedas primero: un conteo se guarda SIN abrir una caja.
-- Requiere 20261120000000_cierre.sql (cash_closings) y 20261122000000_cuentas.sql (cash_sessions.user_id).
--
-- Reutiliza la persistencia actual: un conteo es una fila de cash_closings colgada de una cash_sessions ya cerrada
-- (apertura 0). Así la memoria del asistente (assistant_messages -> cash_closings), las políticas RLS y los registros
-- existentes siguen funcionando igual. El efectivo esperado pasa a ser OPCIONAL (sin él no hay diferencia).

-- 1. expected_cents y difference_cents opcionales, con sus reglas de coherencia.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.cash_closings'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ~ '(expected_cents|difference_cents)'
  loop
    execute format('alter table public.cash_closings drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.cash_closings alter column expected_cents drop not null;
alter table public.cash_closings alter column difference_cents drop not null;

alter table public.cash_closings
  add constraint cash_closings_expected_ok check (expected_cents is null or expected_cents >= 0),
  add constraint cash_closings_difference_ok check (
    (expected_cents is null and difference_cents is null)
    or (expected_cents is not null and difference_cents = counted_cents - expected_cents)
  );

-- 2. Guardar un conteo. El importe contado y la diferencia se calculan aquí, nunca con importes del cliente.
--    p_id es la llave de idempotencia (la genera el cliente): un reintento devuelve el mismo conteo.
create or replace function public.save_count(p_user_id uuid, p_id uuid, p_coins jsonb, p_expected bigint default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  c1 integer; c2 integer; c5 integer; c10 integer;
  v_counted bigint;
  sess_id   uuid;
  existing  public.cash_closings;
  owner     uuid;
  closing   public.cash_closings;
begin
  if p_user_id is null or p_id is null then
    raise exception 'Sesión no válida' using errcode = 'P0002';
  end if;

  select * into existing from public.cash_closings where id = p_id;
  if found then
    select user_id into owner from public.cash_sessions where id = existing.session_id;
    if owner is distinct from p_user_id then
      raise exception 'Identificador en uso' using errcode = 'P0001';
    end if;
    return to_jsonb(existing) || jsonb_build_object('duplicate', true);
  end if;

  if jsonb_typeof(p_coins) is distinct from 'object' then
    raise exception 'Conteo no válido' using errcode = '22023';
  end if;
  begin
    c1 := (p_coins ->> '1')::integer; c2 := (p_coins ->> '2')::integer;
    c5 := (p_coins ->> '5')::integer; c10 := (p_coins ->> '10')::integer;
  exception when others then
    raise exception 'Conteo no válido' using errcode = '22023';
  end;
  if c1 is null or c2 is null or c5 is null or c10 is null
     or least(c1, c2, c5, c10) < 0 or greatest(c1, c2, c5, c10) > 99999 then
    raise exception 'Conteo no válido' using errcode = '22023';
  end if;
  if p_expected is not null and (p_expected < 0 or p_expected > 99999999) then
    raise exception 'Importe no válido' using errcode = '22023';
  end if;

  v_counted := (c1 * 1 + c2 * 2 + c5 * 5 + c10 * 10) * 100::bigint;

  insert into public.cash_sessions (user_id, opening_cents, status, closed_at)
  values (p_user_id, 0, 'closed', now())
  returning id into sess_id;

  insert into public.cash_closings
    (id, session_id, coins_1, coins_2, coins_5, coins_10, expected_cents, counted_cents, difference_cents)
  values
    (p_id, sess_id, c1, c2, c5, c10, p_expected, v_counted,
     case when p_expected is null then null else v_counted - p_expected end)
  returning * into closing;

  return to_jsonb(closing) || jsonb_build_object('duplicate', false);
end;
$$;

-- 3. Indicar (o corregir) el efectivo esperado de un conteo ya guardado. Solo el dueño.
create or replace function public.set_count_expected(p_user_id uuid, p_closing_id uuid, p_expected bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  closing public.cash_closings;
begin
  if p_user_id is null then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  if p_expected is null or p_expected < 0 or p_expected > 99999999 then
    raise exception 'Importe no válido' using errcode = '22023';
  end if;
  update public.cash_closings c
     set expected_cents = p_expected,
         difference_cents = c.counted_cents - p_expected
   where c.id = p_closing_id
     and exists (select 1 from public.cash_sessions s where s.id = c.session_id and s.user_id = p_user_id)
  returning * into closing;
  if not found then
    raise exception 'Caja no encontrada' using errcode = 'P0002';
  end if;
  return to_jsonb(closing) || jsonb_build_object('duplicate', false);
end;
$$;

-- Solo el servidor (service role) las ejecuta.
revoke all on function public.save_count(uuid, uuid, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.set_count_expected(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.save_count(uuid, uuid, jsonb, bigint) to service_role;
grant execute on function public.set_count_expected(uuid, uuid, bigint) to service_role;
