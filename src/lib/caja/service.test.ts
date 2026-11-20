import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "./memory-repo";
import { closeCaja, deleteCaja, computeClosing, getState, HttpError, openCaja, parseCoins, registerSale } from "./service";

let repo: ReturnType<typeof createMemoryRepo>;
beforeEach(() => { repo = createMemoryRepo(); });

const ID = "11111111-1111-4111-8111-111111111111";

describe("flujo de caja", () => {
  it("abre con $20, vende $10 y el esperado es $30 tras releer el estado", async () => {
    const opened = await openCaja(repo, 2000);
    await registerSale(repo, { id: ID, sessionId: opened.session.id, amountCents: 1000 });
    const reloaded = await getState(repo); // equivale a recargar la página
    expect(reloaded?.sales).toHaveLength(1);
    expect(reloaded?.sales[0].amountCents).toBe(1000);
    expect(reloaded?.expectedCents).toBe(3000);
  });

  it("reintentar con el mismo id no duplica la venta", async () => {
    const { session } = await openCaja(repo, 2000);
    const a = await registerSale(repo, { id: ID, sessionId: session.id, amountCents: 1000 });
    const b = await registerSale(repo, { id: ID, sessionId: session.id, amountCents: 1000 });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect((await getState(repo))?.sales).toHaveLength(1);
    expect(b.state.expectedCents).toBe(3000);
  });

  it("un fallo de guardado no crea venta y el reintento sí, una sola vez", async () => {
    const { session } = await openCaja(repo, 2000);
    repo.failNextSaleInserts = 1;
    await expect(registerSale(repo, { id: ID, sessionId: session.id, amountCents: 1000 })).rejects.toThrow();
    expect((await getState(repo))?.sales).toHaveLength(0);
    await registerSale(repo, { id: ID, sessionId: session.id, amountCents: 1000 });
    expect((await getState(repo))?.sales).toHaveLength(1);
  });

  it("peticiones concurrentes con el mismo id producen una sola venta", async () => {
    const { session } = await openCaja(repo, 0);
    await Promise.all([1, 2, 3].map(() => registerSale(repo, { id: ID, sessionId: session.id, amountCents: 500 })));
    expect((await getState(repo))?.sales).toHaveLength(1);
  });

  it("rechaza el mismo id con otro importe", async () => {
    const { session } = await openCaja(repo, 0);
    await registerSale(repo, { id: ID, sessionId: session.id, amountCents: 500 });
    await expect(registerSale(repo, { id: ID, sessionId: session.id, amountCents: 600 })).rejects.toMatchObject({ status: 409 });
  });

  it("valida entradas", async () => {
    await expect(openCaja(repo, 10.5)).rejects.toBeInstanceOf(HttpError);
    await expect(openCaja(repo, -1)).rejects.toBeInstanceOf(HttpError);
    const { session } = await openCaja(repo, 0);
    await expect(openCaja(repo, 0)).rejects.toMatchObject({ status: 409 });
    await expect(registerSale(repo, { id: "x", sessionId: session.id, amountCents: 100 })).rejects.toMatchObject({ status: 400 });
    await expect(registerSale(repo, { id: ID, sessionId: session.id, amountCents: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(registerSale(repo, { id: ID, sessionId: session.id, amountCents: 1.5 })).rejects.toMatchObject({ status: 400 });
  });
});

describe("cierre de caja", () => {
  const ID2 = "22222222-2222-4222-8222-222222222222";

  it("abre con $20, vende $10, cuenta $27 y faltan $3 (300 centavos)", async () => {
    const { session } = await openCaja(repo, 2000);
    await registerSale(repo, { id: ID, sessionId: session.id, amountCents: 1000 });
    // $27 = 1x$10 + 1x$5 + 5x$2 + 2x$1
    const { closing, duplicate } = await closeCaja(repo, { sessionId: session.id, coins: { 1: 2, 2: 5, 5: 1, 10: 1 } });
    expect(duplicate).toBe(false);
    expect(closing).toMatchObject({ expectedCents: 3000, countedCents: 2700, differenceCents: -300 });
    expect(await getState(repo)).toBeNull(); // la caja ya no está abierta
  });

  it("reintentar recupera el mismo cierre y no crea otro", async () => {
    const { session } = await openCaja(repo, 2000);
    const a = await closeCaja(repo, { sessionId: session.id, coins: { 1: 20, 2: 0, 5: 0, 10: 0 } });
    const b = await closeCaja(repo, { sessionId: session.id, coins: { 1: 99, 2: 99, 5: 99, 10: 99 } });
    expect(b.duplicate).toBe(true);
    expect(b.closing).toEqual(a.closing);
    expect(b.closing.differenceCents).toBe(0);
  });

  it("peticiones concurrentes producen un solo cierre", async () => {
    const { session } = await openCaja(repo, 0);
    const rs = await Promise.all([1, 2, 3].map(() => closeCaja(repo, { sessionId: session.id, coins: { 1: 1, 2: 0, 5: 0, 10: 0 } })));
    expect(new Set(rs.map((r) => r.closing.id)).size).toBe(1);
    expect(rs.filter((r) => !r.duplicate)).toHaveLength(1);
  });

  it("una caja cerrada no acepta ventas nuevas ni reabre", async () => {
    const { session } = await openCaja(repo, 2000);
    await closeCaja(repo, { sessionId: session.id, coins: { 1: 0, 2: 0, 5: 0, 10: 0 } });
    await expect(registerSale(repo, { id: ID2, sessionId: session.id, amountCents: 500 })).rejects.toMatchObject({ status: 409 });
    await expect(repo.insertSaleOnce({ id: ID2, sessionId: session.id, amountCents: 500 })).rejects.toMatchObject({ status: 409 });
    expect(await repo.listSales(session.id)).toHaveLength(0);
  });

  it("valida entradas y caja inexistente", async () => {
    const { session } = await openCaja(repo, 0);
    const ok = { 1: 0, 2: 0, 5: 0, 10: 0 };
    await expect(closeCaja(repo, { sessionId: "x", coins: ok })).rejects.toMatchObject({ status: 400 });
    await expect(closeCaja(repo, { sessionId: session.id, coins: { ...ok, 5: -1 } })).rejects.toMatchObject({ status: 400 });
    await expect(closeCaja(repo, { sessionId: session.id, coins: { ...ok, 2: 1.5 } })).rejects.toMatchObject({ status: 400 });
    await expect(closeCaja(repo, { sessionId: session.id, coins: { 1: 0, 2: 0, 5: 0 } })).rejects.toMatchObject({ status: 400 });
    await expect(closeCaja(repo, { sessionId: ID2, coins: ok })).rejects.toMatchObject({ status: 404 });
    expect(await getState(repo)).not.toBeNull(); // nada de lo anterior cerró la caja
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
    const { session } = await openCaja(repo, 2000);
    await registerSale(repo, { id: ID, sessionId: session.id, amountCents: 1000 });
    await registerSale(repo, { id: ID2, sessionId: session.id, amountCents: 500 });
    expect(await deleteCaja(repo, { sessionId: session.id })).toEqual({ deletedSales: 2 });
    expect(await getState(repo)).toBeNull();
    expect(await repo.getSale(ID)).toBeNull();
    const nueva = await openCaja(repo, 100); // la apertura quedó libre
    expect(nueva.session.id).not.toBe(session.id);
    expect(nueva.expectedCents).toBe(100);
  });

  it("rechaza una caja cerrada y la deja intacta", async () => {
    const { session } = await openCaja(repo, 2000);
    await closeCaja(repo, { sessionId: session.id, coins: { 1: 20, 2: 0, 5: 0, 10: 0 } });
    await expect(deleteCaja(repo, { sessionId: session.id })).rejects.toMatchObject({ status: 409 });
    const again = await closeCaja(repo, { sessionId: session.id, coins: { 1: 0, 2: 0, 5: 0, 10: 0 } });
    expect(again.duplicate).toBe(true); // el cierre sigue ahí
  });

  it("valida el id y la existencia", async () => {
    await expect(deleteCaja(repo, { sessionId: "x" })).rejects.toMatchObject({ status: 400 });
    await expect(deleteCaja(repo, { sessionId: ID2 })).rejects.toMatchObject({ status: 404 });
    const { session } = await openCaja(repo, 0);
    await deleteCaja(repo, { sessionId: session.id });
    await expect(deleteCaja(repo, { sessionId: session.id })).rejects.toMatchObject({ status: 404 });
  });
});
