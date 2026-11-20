-- Corte de caja · Memoria del asistente por cuenta + políticas de acceso (RLS) explícitas.
-- Requiere 20261122000000_cuentas.sql (cash_sessions.user_id).
--
-- Perfiles: los INVITADOS no tienen filas en la base (sus datos y su memoria viven en la pestaña, sessionStorage).
-- Solo las CUENTAS guardan aquí: cajas/ventas/cierres (por user_id, vía funciones del servidor) y la memoria del asistente.

-- 1. Memoria del asistente: una fila por pregunta/respuesta, ligada a un cierre y a la cuenta dueña.
create table if not exists public.assistant_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  closing_id uuid not null references public.cash_closings (id) on delete cascade,
  question   text not null check (char_length(question) between 1 and 240),
  answer     text not null check (char_length(answer) between 1 and 500),
  origin     text not null check (origin in ('modelo', 'resumen')),
  amounts    text not null check (char_length(amounts) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_user_closing_idx
  on public.assistant_messages (user_id, closing_id, created_at);

alter table public.assistant_messages enable row level security;

-- 2. Políticas de acceso. «authenticated» solo ve y toca lo suyo; «anon» no ve nada.
drop policy if exists assistant_messages_select_own on public.assistant_messages;
drop policy if exists assistant_messages_insert_own on public.assistant_messages;
drop policy if exists assistant_messages_delete_own on public.assistant_messages;

create policy assistant_messages_select_own on public.assistant_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Solo se puede escribir con el propio user_id y sobre un cierre que sea de la misma cuenta.
create policy assistant_messages_insert_own on public.assistant_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
        from public.cash_closings c
        join public.cash_sessions s on s.id = c.session_id
       where c.id = closing_id and s.user_id = (select auth.uid())
    )
  );

create policy assistant_messages_delete_own on public.assistant_messages
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.assistant_messages from anon, authenticated;
grant select, insert, delete on public.assistant_messages to authenticated;
grant all on public.assistant_messages to service_role;

-- 3. Cajas, ventas y cierres: la app escribe solo mediante funciones del servidor (service role). Se deja además la
--    lectura de lo propio para «authenticated» (necesaria para las políticas de arriba y para consultas directas
--    con el token del usuario) y se retira toda escritura directa a anon/authenticated.
drop policy if exists cash_sessions_select_own on public.cash_sessions;
drop policy if exists sales_select_own on public.sales;
drop policy if exists cash_closings_select_own on public.cash_closings;

create policy cash_sessions_select_own on public.cash_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy sales_select_own on public.sales
  for select to authenticated
  using (exists (select 1 from public.cash_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

create policy cash_closings_select_own on public.cash_closings
  for select to authenticated
  using (exists (select 1 from public.cash_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

revoke all on public.cash_sessions, public.sales, public.cash_closings from anon, authenticated;
grant select on public.cash_sessions, public.sales, public.cash_closings to authenticated;
grant all on public.cash_sessions, public.sales, public.cash_closings to service_role;
