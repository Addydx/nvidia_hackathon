import { describe, expect, it } from "vitest";
import { formatCents, parsePesosToCents } from "./money";

describe("parsePesosToCents", () => {
  it.each([["20", 2000], ["10.5", 1050], ["10,50", 1050], ["$0.07", 7], ["1,234.50", 123450], ["0", 0]])("%s -> %i", (i, c) => {
    expect(parsePesosToCents(i)).toBe(c);
  });
  it.each(["", "abc", "-5", "1.234", "1e3", "1000000000"])("rechaza %j", (i) => {
    expect(parsePesosToCents(i)).toBeNull();
  });
  it("evita errores de punto flotante", () => {
    expect(parsePesosToCents("19.99")).toBe(1999);
    expect(parsePesosToCents("0.29")).toBe(29);
  });
  it("formatea MXN", () => expect(formatCents(3000)).toMatch(/30\.00/));
});
