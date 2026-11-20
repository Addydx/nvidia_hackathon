-- Revierte 20261123000000_cobros.sql. BORRA los registros de cobros: exporta antes si los necesitas.
drop function if exists public.apply_payment_status(text, text, text, timestamptz);
drop table if exists public.stripe_accounts;
drop table if exists public.stripe_events;
drop table if exists public.payments;
