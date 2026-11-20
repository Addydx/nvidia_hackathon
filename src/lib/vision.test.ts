import { describe, expect, it } from "vitest";
import { parseConteo } from "./vision";

describe("parseConteo", () => {
  it("acepta cantidades en la raíz", () => expect(parseConteo({ "1": 3, "2": 0, "5": 4, "10": 1 })).toEqual({ 1: 3, 2: 0, 5: 4, 10: 1 }));
  it("acepta envoltorio y llaves con prefijo", () =>
    expect(parseConteo({ conteo: { "$1": 1, peso_2: 2, m5: 3, moneda_10: 4 }, extra: "x" })).toEqual({ 1: 1, 2: 2, 5: 3, 10: 4 }));
  it.each([null, "x", [], {}, { "1": 1, "2": 2, "5": 3 }, { "1": 1, "2": 2, "5": 3, "10": -1 }, { "1": 1, "2": 2, "5": 3, "10": 1.5 }, { "1": "1", "2": 2, "5": 3, "10": 1 }])(
    "rechaza %j", (v) => expect(parseConteo(v)).toBeNull());
});

import { subtotal, totalPesos } from "./vision";

describe("totales", () => {
  it("suma el valor de las monedas", () => {
    const c = { 1: 3, 2: 1, 5: 2, 10: 4 };
    expect(subtotal(c, 5)).toBe(10);
    expect(totalPesos(c)).toBe(3 + 2 + 10 + 40);
    expect(totalPesos({ 1: 0, 2: 0, 5: 0, 10: 0 })).toBe(0);
  });
});
