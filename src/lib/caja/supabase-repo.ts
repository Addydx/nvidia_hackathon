import { createClient } from "@supabase/supabase-js";
import type { CajaRepo, CashSession, Sale } from "./types";

type SessionRow = { id: string; opening_cents: number; opened_at: string };
type SaleRow = { id: string; session_id: string; amount_cents: number; created_at: string };

const toSession = (r: SessionRow): CashSession => ({
  id: r.id,
  openingCents: Number(r.opening_cents),
  openedAt: r.opened_at,
});
const toSale = (r: SaleRow): Sale => ({
  id: r.id,
  sessionId: r.session_id,
  amountCents: Number(r.amount_cents),
  createdAt: r.created_at,
});

export function createSupabaseRepo(url: string, serviceKey: string): CajaRepo {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const repo: CajaRepo = {
    async getOpenSession() {
      const { data, error } = await db
        .from("cash_sessions")
        .select("id, opening_cents, opened_at")
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return data ? toSession(data) : null;
    },
    async createSession(openingCents) {
      const { data, error } = await db
        .from("cash_sessions")
        .insert({ opening_cents: openingCents })
        .select("id, opening_cents, opened_at")
        .single();
      if (error?.code === "23505") return null; // ya hay una caja abierta
      if (error) throw error;
      return toSession(data);
    },
    async listSales(sessionId) {
      const { data, error } = await db
        .from("sales")
        .select("id, session_id, amount_cents, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toSale);
    },
    async getSale(id) {
      const { data, error } = await db
        .from("sales")
        .select("id, session_id, amount_cents, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? toSale(data) : null;
    },
    async insertSaleOnce({ id, sessionId, amountCents }) {
      // INSERT ... ON CONFLICT (id) DO NOTHING: devuelve fila solo si se insertó.
      const { data, error } = await db
        .from("sales")
        .upsert(
          { id, session_id: sessionId, amount_cents: amountCents },
          { onConflict: "id", ignoreDuplicates: true },
        )
        .select("id, session_id, amount_cents, created_at");
      if (error) throw error;
      if (data && data.length > 0) return { sale: toSale(data[0]), duplicate: false };
      const existing = await repo.getSale(id);
      if (!existing) throw new Error("La venta no se pudo confirmar");
      return { sale: existing, duplicate: true };
    },
  };
  return repo;
}
