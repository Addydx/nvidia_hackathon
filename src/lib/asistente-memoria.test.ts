import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guestMemory, type MemoryItem } from "./asistente-memoria";

const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
const item = (n: number): MemoryItem => ({ id: "m" + n, question: "q" + n, answer: "a" + n, origin: "resumen", amounts: "x", createdAt: "2026-11-20T00:00:00Z" });
const C1 = "f8ca2840-a05a-4ffa-850c-8e590146bbdf", C2 = "0a0a0a0a-a05a-4ffa-850c-8e590146bbdf";

let tab = store();
beforeEach(() => { tab = store(); vi.stubGlobal("window", { sessionStorage: tab }); });
afterEach(() => vi.unstubAllGlobals());

describe("memoria del asistente del invitado", () => {
  it("se guarda en la pestaña y sobrevive a una recarga", () => {
    guestMemory.add(C1, item(1));
    guestMemory.add(C1, item(2));
    expect(guestMemory.load(C1).map((m) => m.id)).toEqual(["m1", "m2"]); // «recarga»: se vuelve a leer del sessionStorage
  });
  it("queda aislada por cierre y por pestaña", () => {
    guestMemory.add(C1, item(1));
    expect(guestMemory.load(C2)).toEqual([]);
    vi.stubGlobal("window", { sessionStorage: store() }); // otra pestaña / navegador / dispositivo
    expect(guestMemory.load(C1)).toEqual([]);
  });
  it("conserva solo las últimas 20 y tolera datos dañados", () => {
    for (let i = 1; i <= 25; i++) guestMemory.add(C1, item(i));
    const all = guestMemory.load(C1);
    expect(all).toHaveLength(20);
    expect(all[0].id).toBe("m6");
    tab.setItem(`cc.guest.memoria.v1.${C2}`, "{roto");
    expect(guestMemory.load(C2)).toEqual([]);
  });
});
