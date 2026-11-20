import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepo, type KV } from "./local-repo";
import { closeCaja, deleteCaja, getLastClosing, getState, openCaja, registerSale } from "./service";

const fakeStorage = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const G = "guest";
const SALE = "11111111-1111-4111-8111-111111111111";
let tab: ReturnType<typeof fakeStorage>;
beforeEach(() => { tab = fakeStorage(); });

describe("caja de invitado (sessionStorage de la pestaña)", () => {
  it("funciona igual que la de una cuenta: abrir, vender, cerrar y ver el último cierre", async () => {
    const repo = createLocalRepo(tab);
    const { session } = await openCaja(repo, G, 2000);
    await registerSale(repo, G, { id: SALE, sessionId: session.id, amountCents: 1000 });
    const { closing } = await closeCaja(repo, G, { sessionId: session.id, coins: { 1: 2, 2: 5, 5: 1, 10: 1 } });
    expect(closing).toMatchObject({ expectedCents: 3000, countedCents: 2700, differenceCents: -300 });
    expect(await getState(repo, G)).toBeNull();
    expect((await getLastClosing(repo, G))?.id).toBe(closing.id);
  });

  it("sobrevive a una recarga: otra instancia sobre el mismo almacenamiento ve los mismos datos", async () => {
    const { session } = await openCaja(createLocalRepo(tab), G, 2000);
    await registerSale(createLocalRepo(tab), G, { id: SALE, sessionId: session.id, amountCents: 1000 });
    const recargado = await getState(createLocalRepo(tab), G); // «recarga»: nueva instancia, mismo sessionStorage
    expect(recargado?.expectedCents).toBe(3000);
    expect(recargado?.sales).toHaveLength(1);
  });

  it("otra pestaña, navegador o dispositivo empieza vacío y no ve los datos de la primera", async () => {
    await openCaja(createLocalRepo(tab), G, 5000);
    const otraPestana = createLocalRepo(fakeStorage());
    expect(await getState(otraPestana, G)).toBeNull();
    expect(await getLastClosing(otraPestana, G)).toBeNull();
    expect((await openCaja(otraPestana, G, 100)).expectedCents).toBe(100); // y puede abrir la suya
  });

  it("limpiar caja borra ventas y apertura solo de este almacenamiento; el cierre no se puede limpiar", async () => {
    const repo = createLocalRepo(tab);
    const a = await openCaja(repo, G, 2000);
    await registerSale(repo, G, { id: SALE, sessionId: a.session.id, amountCents: 1000 });
    expect(await deleteCaja(repo, G, { sessionId: a.session.id })).toEqual({ deletedSales: 1 });
    expect(await getState(repo, G)).toBeNull();
    const b = await openCaja(repo, G, 700);
    await closeCaja(repo, G, { sessionId: b.session.id, coins: { 1: 0, 2: 0, 5: 0, 10: 0 } });
    await expect(deleteCaja(repo, G, { sessionId: b.session.id })).rejects.toMatchObject({ status: 409 });
  });

  it("no toca los datos de una cuenta: usa su propia clave y tolera almacenamiento dañado", async () => {
    tab.setItem("cc.guest.v1", "{no es json");
    const repo = createLocalRepo(tab);
    expect(await getState(repo, G)).toBeNull();
    expect((await openCaja(repo, G, 100)).expectedCents).toBe(100);
    expect([...tab.data.keys()]).toEqual(["cc.guest.v1"]); // nada más se escribe en el almacenamiento
  });
});
