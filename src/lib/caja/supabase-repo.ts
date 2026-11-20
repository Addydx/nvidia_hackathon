import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./service";
import type { CajaRepo, CashSession, Closing, Sale } from "./types";

type SessionRow = { id: string; opening_cents: number; opened_at: string };
type SaleRow = { id: string; session_id: string; amount_cents: number; created_at: string };
type ClosingRow = {
  id: string; session_id: string; coins_1: number; coins_2: number; coins_5: number; coins_10: number;
  expected_cents: number; counted_cents: number; difference_cents: number; closed_at: string; duplicate: boolean;
};

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
const toClosing = (r: ClosingRow): Closing => ({
  id: r.id,
  sessionId: r.session_id,
  coins: { 1: r.coins_1, 2: r.coins_2, 5: r.coins_5, 10: r.coins_10 },
  expectedCents: Number(r.expected_cents),
  countedCents: Number(r.counted_cents),
  differenceCents: Number(r.difference_cents),
  closedAt: r.closed_at,
});

const SESSION_COLS = "id, opening_cents, opened_at";
const SALE_COLS = "id, session_id, amount_cents, created_at";

/**
 * Accede con la service role key (ignora RLS), por eso CADA consulta filtra por user_id:
 * el servidor ya verificó la sesión y pasa el id del usuario autenticado.
 */
export function createSupabaseRepo(url: string, serviceKey: string): CajaRepo {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const repo: CajaRepo = {
    async getOpenSession(userId) {
      const { data, error } = await db
        .from("cash_sessions")
        .select(SESSION_COLS)
        .eq("user_id", userId)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return data ? toSession(data) : null;
    },
    async createSession(userId, openingCents) {
      const { data, error } = await db.rpc("open_cash_session", { p_user_id: userId, p_opening_cents: openingCents });
      if (error) throw error;
      if (!data) return null; // ya tiene una caja abierta
      const r = data as SessionRow;
      return toSession(r);
    },
    async getOwnedSession(userId, sessionId) {
      const { data, error } = await db
        .from("cash_sessions")
        .select(SESSION_COLS)
        .eq("id", sessionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? toSession(data) : null;
    },
    async listSales(userId, sessionId) {
      if (!(await repo.getOwnedSession(userId, sessionId))) return [];
      const { data, error } = await db
        .from("sales")
        .select(SALE_COLS)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toSale);
    },
    async closeSession(userId, sessionId, coins) {
      const { data, error } = await db.rpc("close_cash_session", {
        p_user_id: userId,
        p_session_id: sessionId,
        p_coins: { "1": coins[1], "2": coins[2], "5": coins[5], "10": coins[10] },
      });
      if (error?.code === "P0002") return null; // inexistente o de otro usuario
      if (error?.code === "P0001") throw new HttpError(409, "La caja no está abierta");
      if (error?.code === "22023") throw new HttpError(400, "Conteo de monedas no válido");
      if (error) throw error;
      const row = data as ClosingRow;
      return { closing: toClosing(row), duplicate: row.duplicate };
    },
    async deleteOpenSession(userId, sessionId) {
      const { data, error } = await db.rpc("delete_open_cash_session", { p_user_id: userId, p_session_id: sessionId });
      if (error?.code === "P0002") return null;
      if (error?.code === "P0001") throw new HttpError(409, "La caja ya está cerrada");
      if (error) throw error;
      return { deletedSales: Number((data as { deleted_sales: number }).deleted_sales) };
    },
    async getSale(userId, id) {
      const { data, error } = await db
        .from("sales")
        .select(`${SALE_COLS}, cash_sessions!inner(user_id)`)
        .eq("id", id)
        .eq("cash_sessions.user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? toSale(data as unknown as SaleRow) : null;
    },
    async insertSaleOnce(userId, { id, sessionId, amountCents }) {
      // La venta solo puede ir a una caja del propio usuario.
      if (!(await repo.getOwnedSession(userId, sessionId))) throw new HttpError(409, "La caja no está abierta");
      // INSERT ... ON CONFLICT (id) DO NOTHING: devuelve fila solo si se insertó.
      const { data, error } = await db
        .from("sales")
        .upsert(
          { id, session_id: sessionId, amount_cents: amountCents },
          { onConflict: "id", ignoreDuplicates: true },
        )
        .select(SALE_COLS);
      if (error?.code === "P0001") throw new HttpError(409, "La caja no está abierta");
      if (error) throw error;
      if (data && data.length > 0) return { sale: toSale(data[0]), duplicate: false };
      const existing = await repo.getSale(userId, id);
      if (!existing) throw new HttpError(409, "Este identificador ya se usó con otra venta"); // id de otro usuario
      return { sale: existing, duplicate: true };
    },
  };
  return repo;
}
