import { MAX_CENTS } from "../money";
import type { CajaRepo, CajaState, Closing, Coins, Sale } from "./types";

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

export async function getState(repo: CajaRepo, userId: string): Promise<CajaState | null> {
  const session = await repo.getOpenSession(userId);
  if (!session) return null;
  const sales = await repo.listSales(userId, session.id);
  return { session, sales, expectedCents: expectedCents(session.openingCents, sales) };
}

export async function openCaja(repo: CajaRepo, userId: string, openingCents: unknown): Promise<CajaState> {
  if (!isCents(openingCents, 0)) throw new HttpError(400, "Importe inicial no válido");
  const session = await repo.createSession(userId, openingCents);
  if (!session) throw new HttpError(409, "Ya hay una caja abierta");
  return { session, sales: [], expectedCents: openingCents };
}

export async function registerSale(
  repo: CajaRepo,
  userId: string,
  input: { id: unknown; sessionId: unknown; amountCents: unknown },
): Promise<{ sale: Sale; duplicate: boolean; state: CajaState }> {
  const { id, sessionId, amountCents } = input;
  if (typeof id !== "string" || !UUID.test(id)) throw new HttpError(400, "Identificador de venta no válido");
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) throw new HttpError(400, "Caja no válida");
  if (!isCents(amountCents, 1)) throw new HttpError(400, "Importe de venta no válido");

  const existing = await repo.getSale(userId, id);
  if (existing && (existing.sessionId !== sessionId || existing.amountCents !== amountCents)) {
    throw new HttpError(409, "Este identificador ya se usó con otra venta");
  }
  if (!existing) {
    const open = await repo.getOpenSession(userId);
    if (!open || open.id !== sessionId) throw new HttpError(409, "La caja no está abierta");
  }
  const result = await repo.insertSaleOnce(userId, { id, sessionId, amountCents });
  const state = await getState(repo, userId);
  if (!state) throw new HttpError(409, "La caja no está abierta");
  return { ...result, state };
}

const MAX_COINS = 99_999;
const DENOMS = [1, 2, 5, 10] as const;

/** Valida el conteo recibido: las cuatro denominaciones con enteros entre 0 y 99,999. */
export function parseCoins(input: unknown): Coins | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  const out = {} as Coins;
  for (const d of DENOMS) {
    const n = src[String(d)];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_COINS) return null;
    out[d] = n;
  }
  return out;
}

/** Importes del cierre. El servidor los calcula; el cliente solo manda el conteo de monedas. */
export function computeClosing(openingCents: number, sales: Sale[], coins: Coins) {
  const expected = expectedCents(openingCents, sales);
  const counted = DENOMS.reduce((sum, d) => sum + d * coins[d], 0) * 100;
  return { expectedCents: expected, countedCents: counted, differenceCents: counted - expected };
}

export async function closeCaja(
  repo: CajaRepo,
  userId: string,
  input: { sessionId: unknown; coins: unknown },
): Promise<{ closing: Closing; duplicate: boolean }> {
  if (typeof input.sessionId !== "string" || !UUID.test(input.sessionId)) throw new HttpError(400, "Caja no válida");
  const coins = parseCoins(input.coins);
  if (!coins) throw new HttpError(400, "Conteo de monedas no válido");
  const result = await repo.closeSession(userId, input.sessionId, coins);
  if (!result) throw new HttpError(404, "Caja no encontrada");
  return result;
}

export async function deleteCaja(repo: CajaRepo, userId: string, input: { sessionId: unknown }): Promise<{ deletedSales: number }> {
  if (typeof input.sessionId !== "string" || !UUID.test(input.sessionId)) throw new HttpError(400, "Caja no válida");
  const result = await repo.deleteOpenSession(userId, input.sessionId);
  if (!result) throw new HttpError(404, "Caja no encontrada");
  return result;
}

export async function getLastClosing(repo: CajaRepo, userId: string): Promise<Closing | null> {
  return repo.getLastClosing(userId);
}

/** Importes de un conteo guardado sin caja: el contado sale solo de las monedas; la diferencia, solo si hay esperado. */
export function computeCount(coins: Coins, expectedCents: number | null) {
  const counted = DENOMS.reduce((sum, d) => sum + d * coins[d], 0) * 100;
  return { countedCents: counted, expectedCents, differenceCents: expectedCents === null ? null : counted - expectedCents };
}

export async function saveCount(
  repo: CajaRepo,
  userId: string,
  input: { id: unknown; coins: unknown; expectedCents?: unknown },
): Promise<{ closing: Closing; duplicate: boolean }> {
  if (typeof input.id !== "string" || !UUID.test(input.id)) throw new HttpError(400, "Identificador de conteo no válido");
  const coins = parseCoins(input.coins);
  if (!coins) throw new HttpError(400, "Conteo de monedas no válido");
  const expected = input.expectedCents ?? null;
  if (expected !== null && !isCents(expected, 0)) throw new HttpError(400, "Efectivo esperado no válido");
  return repo.saveCount(userId, { id: input.id, coins, expectedCents: expected });
}

export async function setExpected(repo: CajaRepo, userId: string, input: { closingId: unknown; expectedCents: unknown }): Promise<Closing> {
  if (typeof input.closingId !== "string" || !UUID.test(input.closingId)) throw new HttpError(400, "Conteo no válido");
  if (!isCents(input.expectedCents, 0)) throw new HttpError(400, "Efectivo esperado no válido");
  const closing = await repo.setExpected(userId, input.closingId, input.expectedCents);
  if (!closing) throw new HttpError(404, "Conteo no encontrado");
  return closing;
}

export async function listHistory(repo: CajaRepo, userId: string, limit = 20): Promise<Closing[]> {
  return repo.listClosings(userId, Math.min(Math.max(limit, 1), 50));
}
