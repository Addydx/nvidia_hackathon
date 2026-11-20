import { randomUUID } from "node:crypto";
import { HttpError, computeClosing, computeCount } from "./service";
import type { CajaRepo, CashSession, Closing, Coins, Sale } from "./types";

type Owned = CashSession & { userId: string };

/** Solo para pruebas y desarrollo local sin Supabase. Aísla los datos por usuario igual que la base real. */
export function createMemoryRepo(): CajaRepo & { failNextSaleInserts: number } {
  const sessions = new Map<string, Owned>(); // todas las cajas, abiertas o cerradas
  const open = new Map<string, string>(); // userId -> id de su caja abierta
  const closings = new Map<string, Closing>(); // por id del cierre
  const sales = new Map<string, Sale>();

  const owned = (userId: string, sessionId: string) => {
    const s = sessions.get(sessionId);
    return s && s.userId === userId ? s : null;
  };
  const strip = ({ userId: _u, ...s }: Owned): CashSession => s; // eslint-disable-line @typescript-eslint/no-unused-vars

  const repo = {
    failNextSaleInserts: 0,
    async getOpenSession(userId: string) {
      const id = open.get(userId);
      const s = id ? sessions.get(id) : undefined;
      return s ? strip(s) : null;
    },
    async createSession(userId: string, openingCents: number) {
      if (open.has(userId)) return null;
      const s: Owned = { id: randomUUID(), userId, openingCents, openedAt: new Date().toISOString() };
      sessions.set(s.id, s);
      open.set(userId, s.id);
      return strip(s);
    },
    async getOwnedSession(userId: string, sessionId: string) {
      const s = owned(userId, sessionId);
      return s ? strip(s) : null;
    },
    async listSales(userId: string, sessionId: string) {
      if (!owned(userId, sessionId)) return [];
      return [...sales.values()]
        .filter((s) => s.sessionId === sessionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async closeSession(userId: string, sessionId: string, coins: Coins) {
      const s = owned(userId, sessionId);
      if (!s) return null;
      const done = [...closings.values()].find((c) => c.sessionId === sessionId);
      if (done) return { closing: done, duplicate: true };
      if (open.get(userId) !== sessionId) throw new HttpError(409, "La caja no está abierta");
      const mine = [...sales.values()].filter((x) => x.sessionId === sessionId);
      const closing: Closing = {
        id: randomUUID(),
        sessionId,
        coins: { ...coins },
        ...computeClosing(s.openingCents, mine, coins),
        closedAt: new Date().toISOString(),
      };
      closings.set(closing.id, closing);
      open.delete(userId);
      return { closing, duplicate: false };
    },
    async deleteOpenSession(userId: string, sessionId: string) {
      if (!owned(userId, sessionId)) return null;
      if (open.get(userId) !== sessionId) throw new HttpError(409, "La caja ya está cerrada");
      let deletedSales = 0;
      for (const [id, sale] of sales) {
        if (sale.sessionId === sessionId) {
          sales.delete(id);
          deletedSales++;
        }
      }
      sessions.delete(sessionId);
      open.delete(userId);
      return { deletedSales };
    },
    async saveCount(userId: string, input: { id: string; coins: Coins; expectedCents: number | null }) {
      const done = closings.get(input.id);
      if (done) {
        if (!owned(userId, done.sessionId)) throw new HttpError(409, "Este identificador ya se usó");
        return { closing: done, duplicate: true };
      }
      const s: Owned = { id: randomUUID(), userId, openingCents: 0, openedAt: new Date().toISOString() };
      sessions.set(s.id, s); // sesión ya cerrada: no figura como caja abierta
      const closing: Closing = { id: input.id, sessionId: s.id, coins: { ...input.coins }, ...computeCount(input.coins, input.expectedCents), closedAt: new Date().toISOString() };
      closings.set(closing.id, closing);
      return { closing, duplicate: false };
    },
    async setExpected(userId: string, closingId: string, expectedCents: number) {
      const c = closings.get(closingId);
      if (!c || !owned(userId, c.sessionId)) return null;
      const next: Closing = { ...c, expectedCents, differenceCents: c.countedCents - expectedCents };
      closings.set(closingId, next);
      return next;
    },
    async listClosings(userId: string, limit: number) {
      return [...closings.values()].reverse().filter((c) => owned(userId, c.sessionId)).sort((a, b) => b.closedAt.localeCompare(a.closedAt)).slice(0, limit); // en empate, el último guardado primero
    },
    async getLastClosing(userId: string) {
      const mine = [...closings.values()].reverse().filter((c) => owned(userId, c.sessionId));
      mine.sort((a, b) => b.closedAt.localeCompare(a.closedAt));
      return mine[0] ?? null;
    },
    async getSale(userId: string, id: string) {
      const sale = sales.get(id);
      return sale && owned(userId, sale.sessionId) ? sale : null;
    },
    async insertSaleOnce(userId: string, input: { id: string; sessionId: string; amountCents: number }) {
      const existing = sales.get(input.id);
      if (existing) {
        if (!owned(userId, existing.sessionId)) throw new HttpError(409, "Este identificador ya se usó con otra venta");
        return { sale: existing, duplicate: true };
      }
      if (open.get(userId) !== input.sessionId) throw new HttpError(409, "La caja no está abierta");
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
