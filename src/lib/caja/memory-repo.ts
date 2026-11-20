import { randomUUID } from "node:crypto";
import type { CajaRepo, CashSession, Sale } from "./types";

/** Solo para pruebas y desarrollo local sin Supabase. */
export function createMemoryRepo(): CajaRepo & { failNextSaleInserts: number } {
  let session: CashSession | null = null;
  const sales = new Map<string, Sale>();
  const repo = {
    failNextSaleInserts: 0,
    async getOpenSession() {
      return session;
    },
    async createSession(openingCents: number) {
      if (session) return null;
      session = { id: randomUUID(), openingCents, openedAt: new Date().toISOString() };
      return session;
    },
    async listSales(sessionId: string) {
      return [...sales.values()]
        .filter((s) => s.sessionId === sessionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async getSale(id: string) {
      return sales.get(id) ?? null;
    },
    async insertSaleOnce(input: { id: string; sessionId: string; amountCents: number }) {
      const existing = sales.get(input.id);
      if (existing) return { sale: existing, duplicate: true };
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
