import { MAX_CENTS } from "../money";
import type { CajaRepo, CajaState, Sale } from "./types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isCents = (n: unknown, min: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= MAX_CENTS;

export function expectedCents(openingCents: number, sales: Sale[]): number {
  return sales.reduce((sum, s) => sum + s.amountCents, openingCents);
}

export async function getState(repo: CajaRepo): Promise<CajaState | null> {
  const session = await repo.getOpenSession();
  if (!session) return null;
  const sales = await repo.listSales(session.id);
  return { session, sales, expectedCents: expectedCents(session.openingCents, sales) };
}

export async function openCaja(repo: CajaRepo, openingCents: unknown): Promise<CajaState> {
  if (!isCents(openingCents, 0)) throw new HttpError(400, "Importe inicial no válido");
  const session = await repo.createSession(openingCents);
  if (!session) throw new HttpError(409, "Ya hay una caja abierta");
  return { session, sales: [], expectedCents: openingCents };
}

export async function registerSale(
  repo: CajaRepo,
  input: { id: unknown; sessionId: unknown; amountCents: unknown },
): Promise<{ sale: Sale; duplicate: boolean; state: CajaState }> {
  const { id, sessionId, amountCents } = input;
  if (typeof id !== "string" || !UUID.test(id)) throw new HttpError(400, "Identificador de venta no válido");
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) throw new HttpError(400, "Caja no válida");
  if (!isCents(amountCents, 1)) throw new HttpError(400, "Importe de venta no válido");

  const existing = await repo.getSale(id);
  if (existing && (existing.sessionId !== sessionId || existing.amountCents !== amountCents)) {
    throw new HttpError(409, "Este identificador ya se usó con otra venta");
  }
  if (!existing) {
    const open = await repo.getOpenSession();
    if (!open || open.id !== sessionId) throw new HttpError(409, "La caja no está abierta");
  }
  const result = await repo.insertSaleOnce({ id, sessionId, amountCents });
  const state = await getState(repo);
  if (!state) throw new HttpError(409, "La caja no está abierta");
  return { ...result, state };
}
