import { HttpError, computeClosing } from "./service";
import type { CajaRepo, CashSession, Closing, Coins, Sale } from "./types";

/** Almacenamiento mínimo (sessionStorage en el navegador; un objeto en las pruebas). */
export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

type Data = { sessions: CashSession[]; sales: Sale[]; closings: Closing[]; openId: string | null };
const empty = (): Data => ({ sessions: [], sales: [], closings: [], openId: null });

/**
 * Repositorio del INVITADO: los datos viven solo en el almacenamiento de la pestaña (sessionStorage), nunca en el
 * servidor. Sobreviven a una recarga y no se comparten con otras pestañas, navegadores ni dispositivos. Reutiliza
 * las mismas reglas del servicio de Caja (importes, cierre, limpiar) que usan las cuentas. El `userId` que reciben
 * los métodos se ignora: aquí solo existe el perfil invitado.
 */
export function createLocalRepo(storage: KV, key = "cc.guest.v1"): CajaRepo {
  const load = (): Data => {
    try {
      const raw = storage.getItem(key);
      return raw ? { ...empty(), ...(JSON.parse(raw) as Partial<Data>) } : empty();
    } catch {
      return empty();
    }
  };
  const save = (d: Data) => storage.setItem(key, JSON.stringify(d));
  const uuid = () => crypto.randomUUID();

  return {
    async getOpenSession() {
      const d = load();
      return d.sessions.find((s) => s.id === d.openId) ?? null;
    },
    async createSession(_u, openingCents) {
      const d = load();
      if (d.openId) return null;
      const s: CashSession = { id: uuid(), openingCents, openedAt: new Date().toISOString() };
      d.sessions.push(s);
      d.openId = s.id;
      save(d);
      return s;
    },
    async getOwnedSession(_u, sessionId) {
      return load().sessions.find((s) => s.id === sessionId) ?? null;
    },
    async listSales(_u, sessionId) {
      return load().sales.filter((s) => s.sessionId === sessionId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async closeSession(_u, sessionId, coins: Coins) {
      const d = load();
      const s = d.sessions.find((x) => x.id === sessionId);
      if (!s) return null;
      const done = d.closings.find((c) => c.sessionId === sessionId);
      if (done) return { closing: done, duplicate: true };
      if (d.openId !== sessionId) throw new HttpError(409, "La caja no está abierta");
      const closing: Closing = {
        id: uuid(),
        sessionId,
        coins: { ...coins },
        ...computeClosing(s.openingCents, d.sales.filter((x) => x.sessionId === sessionId), coins),
        closedAt: new Date().toISOString(),
      };
      d.closings.push(closing);
      d.openId = null;
      save(d);
      return { closing, duplicate: false };
    },
    async deleteOpenSession(_u, sessionId) {
      const d = load();
      if (!d.sessions.some((s) => s.id === sessionId)) return null;
      if (d.openId !== sessionId) throw new HttpError(409, "La caja ya está cerrada");
      const before = d.sales.length;
      d.sales = d.sales.filter((s) => s.sessionId !== sessionId);
      d.sessions = d.sessions.filter((s) => s.id !== sessionId);
      d.openId = null;
      save(d);
      return { deletedSales: before - d.sales.length };
    },
    async getLastClosing() {
      const c = [...load().closings].sort((a, b) => b.closedAt.localeCompare(a.closedAt));
      return c[0] ?? null;
    },
    async getSale(_u, id) {
      return load().sales.find((s) => s.id === id) ?? null;
    },
    async insertSaleOnce(_u, input: { id: string; sessionId: string; amountCents: number }) {
      const d = load();
      const existing = d.sales.find((s) => s.id === input.id);
      if (existing) return { sale: existing, duplicate: true };
      if (d.openId !== input.sessionId) throw new HttpError(409, "La caja no está abierta");
      const sale: Sale = { ...input, createdAt: new Date().toISOString() };
      d.sales.push(sale);
      save(d);
      return { sale, duplicate: false };
    },
  };
}
