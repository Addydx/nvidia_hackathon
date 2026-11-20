import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "./memory-repo";
import { getState, HttpError, openCaja, registerSale } from "./service";

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
