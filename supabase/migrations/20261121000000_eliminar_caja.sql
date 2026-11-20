-- Corte de caja · Eliminar caja abierta.
-- Requiere 20261119000000_caja.sql y 20261120000000_cierre.sql.

-- Borra una caja ABIERTA con sus ventas, en una sola transacción.
-- Bloquea la caja (FOR UPDATE) para que no corra a la vez con un cierre o una venta:
-- las ventas esperan ese lock y el cierre ve la caja ya borrada.
-- Una caja cerrada (con cierre guardado) nunca se borra.
create or replace function public.delete_open_cash_session(p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  sess public.cash_sessions;
  n    integer;
begin
  select * into sess from public.cash_sessions where id = p_session_id for update;
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

-- Solo el servidor (service role) puede borrar cajas.
revoke all on function public.delete_open_cash_session(uuid) from public, anon, authenticated;
grant execute on function public.delete_open_cash_session(uuid) to service_role;
