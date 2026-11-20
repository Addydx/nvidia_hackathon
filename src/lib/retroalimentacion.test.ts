import { beforeEach, expect, it, vi } from "vitest";
import { guardarRetro, sinMonedas } from "./retroalimentacion";

const c = (a: number) => ({ 1: a, 2: 0, 5: 0, 10: 0 });
beforeEach(() => {
  const m = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
});

it("detecta resultado vacío", () => {
  expect(sinMonedas(c(0))).toBe(true);
  expect(sinMonedas(c(1))).toBe(false);
});
it("no duplica: la misma foto actualiza su registro y conserva original y corregido", () => {
  guardarRetro({ id: "foto-1", valoracion: "conteo_incorrecto", original: c(2), corregido: c(2), actualizadoEn: "a" });
  const t = guardarRetro({ id: "foto-1", valoracion: "conteo_incorrecto", original: c(2), corregido: c(3), actualizadoEn: "b" });
  expect(t).toHaveLength(1);
  expect(t[0].original[1]).toBe(2);
  expect(t[0].corregido[1]).toBe(3);
});
