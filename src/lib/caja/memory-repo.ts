import { randomUUID } from "node:crypto";
import { HttpError, computeClosing } from "./service";
import type { CajaRepo, CashSession, Closing, Coins, Sale } from "./types";

/** Solo para pruebas y desarrollo local sin Supabase. */
export function createMemoryRepo(): CajaRepo & { failNextSaleInserts: number } {
  let session: CashSession | null = null; // caja abierta
  const known = new Map<string, CashSession>(); // todas las cajas, abiertas o cerradas
  const closings = new Map<string, Closing>();
  const sales = new Map<string, Sale>();
  const repo = {
    failNextSaleInserts: 0,
    async getOpenSession() {
      return session;
    },
    async createSession(openingCents: number) {
      if (session) return null;
      session = { id: randomUUID(), openingCents, openedAt: new Date().toISOString() };
      known.set(session.id, session);
      return session;
    },
    async listSales(sessionId: string) {
      return [...sales.values()]
        .filter((s) => s.sessionId === sessionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async closeSession(sessionId: string, coins: Coins) {
      const done = closings.get(sessionId);
      if (done) return { closing: done, duplicate: true };
      const s = known.get(sessionId);
      if (!s) return null;
      if (session?.id !== sessionId) throw new HttpError(409, "La caja no está abierta");
      const mine = [...sales.values()].filter((x) => x.sessionId === sessionId);
      const closing: Closing = {
        id: randomUUID(),
        sessionId,
        coins: { ...coins },
        ...computeClosing(s.openingCents, mine, coins),
        closedAt: new Date().toISOString(),
      };
      closings.set(sessionId, closing);
      session = null;
      return { closing, duplicate: false };
    },
    async deleteOpenSession(sessionId: string) {
      if (!known.has(sessionId)) return null;
      if (session?.id !== sessionId) throw new HttpError(409, "La caja ya está cerrada");
      let deletedSales = 0;
      for (const [id, sale] of sales) {
        if (sale.sessionId === sessionId) {
          sales.delete(id);
          deletedSales++;
        }
      }
      known.delete(sessionId);
      session = null;
      return { deletedSales };
    },
    async getSale(id: string) {
      return sales.get(id) ?? null;
    },
    async insertSaleOnce(input: { id: string; sessionId: string; amountCents: number }) {
      const existing = sales.get(input.id);
      if (existing) return { sale: existing, duplicate: true };
      if (session?.id !== input.sessionId) throw new HttpError(409, "La caja no está abierta");
      if (repo.failNextSaleInserts > 0) {
        repo.failNextSaleInserts--;
        throw new Error("fallo simulado");
      }
      const sale: Sale = { ...input, createdAt: new Date().toISOString() };
      sales.set(sale.id, sale);
      return { sale, duplicate: false };
    },
  };
  return repo;
}
