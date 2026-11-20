import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "./memory-repo";
import { closeCaja, deleteCaja, computeClosing, getState, HttpError, openCaja, parseCoins, registerSale } from "./service";

let repo: ReturnType<typeof createMemoryRepo>;
beforeEach(() => { repo = createMemoryRepo(); });

const ID = "11111111-1111-4111-8111-111111111111";
const U = "aaaaaaaa-0000-4000-8000-00000000000a"; // usuario A
const V = "bbbbbbbb-0000-4000-8000-00000000000b"; // usuario B

describe("flujo de caja", () => {
  it("abre con $20, vende $10 y el esperado es $30 tras releer el estado", async () => {
    const opened = await openCaja(repo, U, 2000);
    await registerSale(repo, U, { id: ID, sessionId: opened.session.id, amountCents: 1000 });
    const reloaded = await getState(repo, U); // equivale a recargar la página
    expect(reloaded?.sales).toHaveLength(1);
    expect(reloaded?.sales[0].amountCents).toBe(1000);
    expect(reloaded?.expectedCents).toBe(3000);
  });

  it("reintentar con el mismo id no duplica la venta", async () => {
    const { session } = await openCaja(repo, U, 2000);
    const a = await registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 1000 });
    const b = await registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 1000 });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect((await getState(repo, U))?.sales).toHaveLength(1);
    expect(b.state.expectedCents).toBe(3000);
  });

  it("un fallo de guardado no crea venta y el reintento sí, una sola vez", async () => {
    const { session } = await openCaja(repo, U, 2000);
    repo.failNextSaleInserts = 1;
    await expect(registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 1000 })).rejects.toThrow();
    expect((await getState(repo, U))?.sales).toHaveLength(0);
    await registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 1000 });
    expect((await getState(repo, U))?.sales).toHaveLength(1);
  });

  it("peticiones concurrentes con el mismo id producen una sola venta", async () => {
    const { session } = await openCaja(repo, U, 0);
    await Promise.all([1, 2, 3].map(() => registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 500 })));
    expect((await getState(repo, U))?.sales).toHaveLength(1);
  });

  it("rechaza el mismo id con otro importe", async () => {
    const { session } = await openCaja(repo, U, 0);
    await registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 500 });
    await expect(registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 600 })).rejects.toMatchObject({ status: 409 });
  });

  it("valida entradas", async () => {
    await expect(openCaja(repo, U, 10.5)).rejects.toBeInstanceOf(HttpError);
    await expect(openCaja(repo, U, -1)).rejects.toBeInstanceOf(HttpError);
    const { session } = await openCaja(repo, U, 0);
    await expect(openCaja(repo, U, 0)).rejects.toMatchObject({ status: 409 });
    await expect(registerSale(repo, U, { id: "x", sessionId: session.id, amountCents: 100 })).rejects.toMatchObject({ status: 400 });
    await expect(registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 1.5 })).rejects.toMatchObject({ status: 400 });
  });
});

describe("cierre de caja", () => {
  const ID2 = "22222222-2222-4222-8222-222222222222";

  it("abre con $20, vende $10, cuenta $27 y faltan $3 (300 centavos)", async () => {
    const { session } = await openCaja(repo, U, 2000);
    await registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 1000 });
    // $27 = 1x$10 + 1x$5 + 5x$2 + 2x$1
    const { closing, duplicate } = await closeCaja(repo, U, { sessionId: session.id, coins: { 1: 2, 2: 5, 5: 1, 10: 1 } });
    expect(duplicate).toBe(false);
    expect(closing).toMatchObject({ expectedCents: 3000, countedCents: 2700, differenceCents: -300 });
    expect(await getState(repo, U)).toBeNull(); // la caja ya no está abierta
  });

  it("reintentar recupera el mismo cierre y no crea otro", async () => {
    const { session } = await openCaja(repo, U, 2000);
    const a = await closeCaja(repo, U, { sessionId: session.id, coins: { 1: 20, 2: 0, 5: 0, 10: 0 } });
    const b = await closeCaja(repo, U, { sessionId: session.id, coins: { 1: 99, 2: 99, 5: 99, 10: 99 } });
    expect(b.duplicate).toBe(true);
    expect(b.closing).toEqual(a.closing);
    expect(b.closing.differenceCents).toBe(0);
  });

  it("peticiones concurrentes producen un solo cierre", async () => {
    const { session } = await openCaja(repo, U, 0);
    const rs = await Promise.all([1, 2, 3].map(() => closeCaja(repo, U, { sessionId: session.id, coins: { 1: 1, 2: 0, 5: 0, 10: 0 } })));
    expect(new Set(rs.map((r) => r.closing.id)).size).toBe(1);
    expect(rs.filter((r) => !r.duplicate)).toHaveLength(1);
  });

  it("una caja cerrada no acepta ventas nuevas ni reabre", async () => {
    const { session } = await openCaja(repo, U, 2000);
    await closeCaja(repo, U, { sessionId: session.id, coins: { 1: 0, 2: 0, 5: 0, 10: 0 } });
    await expect(registerSale(repo, U, { id: ID2, sessionId: session.id, amountCents: 500 })).rejects.toMatchObject({ status: 409 });
    await expect(repo.insertSaleOnce(U, { id: ID2, sessionId: session.id, amountCents: 500 })).rejects.toMatchObject({ status: 409 });
    expect(await repo.listSales(U, session.id)).toHaveLength(0);
  });

  it("valida entradas y caja inexistente", async () => {
    const { session } = await openCaja(repo, U, 0);
    const ok = { 1: 0, 2: 0, 5: 0, 10: 0 };
    await expect(closeCaja(repo, U, { sessionId: "x", coins: ok })).rejects.toMatchObject({ status: 400 });
    await expect(closeCaja(repo, U, { sessionId: session.id, coins: { ...ok, 5: -1 } })).rejects.toMatchObject({ status: 400 });
    await expect(closeCaja(repo, U, { sessionId: session.id, coins: { ...ok, 2: 1.5 } })).rejects.toMatchObject({ status: 400 });
    await expect(closeCaja(repo, U, { sessionId: session.id, coins: { 1: 0, 2: 0, 5: 0 } })).rejects.toMatchObject({ status: 400 });
    await expect(closeCaja(repo, U, { sessionId: ID2, coins: ok })).rejects.toMatchObject({ status: 404 });
    expect(await getState(repo, U)).not.toBeNull(); // nada de lo anterior cerró la caja
  });

  it("parseCoins y computeClosing", () => {
    expect(parseCoins({ 1: 1, 2: 2, 5: 3, 10: 4 })).toEqual({ 1: 1, 2: 2, 5: 3, 10: 4 });
    expect(parseCoins({ 1: 100000, 2: 0, 5: 0, 10: 0 })).toBeNull();
    expect(computeClosing(2000, [], { 1: 0, 2: 0, 5: 0, 10: 3 })).toEqual({ expectedCents: 2000, countedCents: 3000, differenceCents: 1000 });
  });
});

describe("eliminar caja abierta", () => {
  const ID2 = "22222222-2222-4222-8222-222222222222";

  it("borra la caja y sus ventas, y libera la apertura", async () => {
    const { session } = await openCaja(repo, U, 2000);
    await registerSale(repo, U, { id: ID, sessionId: session.id, amountCents: 1000 });
    await registerSale(repo, U, { id: ID2, sessionId: session.id, amountCents: 500 });
    expect(await deleteCaja(repo, U, { sessionId: session.id })).toEqual({ deletedSales: 2 });
    expect(await getState(repo, U)).toBeNull();
    expect(await repo.getSale(U, ID)).toBeNull();
    const nueva = await openCaja(repo, U, 100); // la apertura quedó libre
    expect(nueva.session.id).not.toBe(session.id);
    expect(nueva.expectedCents).toBe(100);
  });

  it("rechaza una caja cerrada y la deja intacta", async () => {
    const { session } = await openCaja(repo, U, 2000);
    await closeCaja(repo, U, { sessionId: session.id, coins: { 1: 20, 2: 0, 5: 0, 10: 0 } });
    await expect(deleteCaja(repo, U, { sessionId: session.id })).rejects.toMatchObject({ status: 409 });
    const again = await closeCaja(repo, U, { sessionId: session.id, coins: { 1: 0, 2: 0, 5: 0, 10: 0 } });
    expect(again.duplicate).toBe(true); // el cierre sigue ahí
  });

  it("valida el id y la existencia", async () => {
    await expect(deleteCaja(repo, U, { sessionId: "x" })).rejects.toMatchObject({ status: 400 });
    await expect(deleteCaja(repo, U, { sessionId: ID2 })).rejects.toMatchObject({ status: 404 });
    const { session } = await openCaja(repo, U, 0);
    await deleteCaja(repo, U, { sessionId: session.id });
    await expect(deleteCaja(repo, U, { sessionId: session.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe("aislamiento entre cuentas", () => {
  const ID2 = "22222222-2222-4222-8222-222222222222";
  const COINS = { 1: 1, 2: 0, 5: 0, 10: 0 };

  it("cada cuenta abre su propia caja a la vez", async () => {
    const a = await openCaja(repo, U, 2000);
    const b = await openCaja(repo, V, 500);
    expect(a.session.id).not.toBe(b.session.id);
    expect((await getState(repo, U))?.expectedCents).toBe(2000);
    expect((await getState(repo, V))?.expectedCents).toBe(500);
    await expect(openCaja(repo, U, 1)).rejects.toMatchObject({ status: 409 }); // solo una abierta por cuenta
  });

  it("una cuenta no ve la caja ni las ventas de la otra", async () => {
    const a = await openCaja(repo, U, 2000);
    await registerSale(repo, U, { id: ID, sessionId: a.session.id, amountCents: 1000 });
    expect(await getState(repo, V)).toBeNull();
    expect(await repo.getOwnedSession(V, a.session.id)).toBeNull();
    expect(await repo.listSales(V, a.session.id)).toEqual([]);
    expect(await repo.getSale(V, ID)).toBeNull();
  });

  it("no puede registrar ventas en la caja ajena", async () => {
    const a = await openCaja(repo, U, 2000);
    await openCaja(repo, V, 0);
    await expect(registerSale(repo, V, { id: ID, sessionId: a.session.id, amountCents: 100 })).rejects.toMatchObject({ status: 409 });
    expect(await repo.listSales(U, a.session.id)).toHaveLength(0);
  });

  it("no puede cerrar la caja ajena y la caja sigue abierta", async () => {
    const a = await openCaja(repo, U, 2000);
    await expect(closeCaja(repo, V, { sessionId: a.session.id, coins: COINS })).rejects.toMatchObject({ status: 404 });
    expect(await getState(repo, U)).not.toBeNull();
  });

  it("no puede limpiar la caja ajena y sus ventas siguen ahí", async () => {
    const a = await openCaja(repo, U, 2000);
    await registerSale(repo, U, { id: ID, sessionId: a.session.id, amountCents: 1000 });
    await expect(deleteCaja(repo, V, { sessionId: a.session.id })).rejects.toMatchObject({ status: 404 });
    expect((await getState(repo, U))?.sales).toHaveLength(1);
  });

  it("limpiar la propia caja libera solo la apertura propia", async () => {
    const a = await openCaja(repo, U, 2000);
    const b = await openCaja(repo, V, 700);
    await registerSale(repo, U, { id: ID, sessionId: a.session.id, amountCents: 1000 });
    await registerSale(repo, V, { id: ID2, sessionId: b.session.id, amountCents: 300 });
    expect(await deleteCaja(repo, U, { sessionId: a.session.id })).toEqual({ deletedSales: 1 });
    expect(await getState(repo, U)).toBeNull();
    expect((await getState(repo, V))?.expectedCents).toBe(1000); // la de V intacta
    expect((await openCaja(repo, U, 50)).expectedCents).toBe(50);
  });

  it("el mismo id de venta no se puede reutilizar desde otra cuenta", async () => {
    const a = await openCaja(repo, U, 0);
    const b = await openCaja(repo, V, 0);
    await registerSale(repo, U, { id: ID, sessionId: a.session.id, amountCents: 100 });
    await expect(registerSale(repo, V, { id: ID, sessionId: b.session.id, amountCents: 100 })).rejects.toMatchObject({ status: 409 });
    expect(await repo.listSales(V, b.session.id)).toHaveLength(0);
  });

  it("el cierre recuperado en un reintento solo lo ve su dueño", async () => {
    const a = await openCaja(repo, U, 2000);
    await closeCaja(repo, U, { sessionId: a.session.id, coins: COINS });
    await expect(closeCaja(repo, V, { sessionId: a.session.id, coins: COINS })).rejects.toMatchObject({ status: 404 });
    expect((await closeCaja(repo, U, { sessionId: a.session.id, coins: COINS })).duplicate).toBe(true);
  });
});
